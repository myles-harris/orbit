/**
 * Unit tests for the presence fan-out service: debounced broadcast, count
 * correctness, mute filtering, Android ongoing/dismissible bucketing, the
 * ended-call grace window, rollback-on-failure, the targeted seed, and the
 * PRESENCE_ENABLED kill switch.
 */

jest.mock('../services/notifications', () => ({
  notifications: {
    updateLiveActivities: jest.fn().mockResolvedValue({ success: 0, failure: 0, stale: [] }),
    endLiveActivities: jest.fn().mockResolvedValue(undefined),
    sendExpoData: jest.fn().mockResolvedValue({ success: 0, failure: 0 }),
  },
}));

import { PrismaClient } from '@prisma/client';
import {
  broadcastCallPresence, sendPresenceToToken, forgetCallPresence, endLiveActivitiesForCall,
} from '../services/callPresence.js';
import { notifications } from '../services/notifications.js';
// Not mocked in this file: dailyVideo stubs itself with no DAILY_API_KEY set, and
// its own dependency on notifications.js picks up the jest.mock above.
import { scheduler } from '../services/scheduler.js';

const mockUpdate = notifications.updateLiveActivities as jest.Mock;
const mockEnd = notifications.endLiveActivities as jest.Mock;
const mockSendExpoData = notifications.sendExpoData as jest.Mock;

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  mockUpdate.mockClear();
  mockEnd.mockClear();
  mockSendExpoData.mockClear();
});

// The debounce is a real 1s setTimeout; wait past it with real time rather than
// fake timers so the real Prisma I/O inside runBroadcast has a chance to settle.
const DEBOUNCE_WAIT_MS = 1100;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function makeUser(suffix: string) {
  return prisma.user.create({
    data: {
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      username: `presence_${suffix}_${Math.random().toString(36).slice(2, 8)}`,
      time_zone: 'UTC',
    },
  });
}

async function makeGroupWithOwner(ownerId: string) {
  const group = await prisma.group.create({
    data: { name: 'Presence Group', cadence: 'daily', call_duration_minutes: 30, owner_id: ownerId },
  });
  await prisma.groupMember.create({ data: { group_id: group.id, user_id: ownerId, role: 'owner' } });
  return group;
}

async function addMember(groupId: string, userId: string, isMuted = false) {
  return prisma.groupMember.create({
    data: { group_id: groupId, user_id: userId, role: 'member', is_muted: isMuted },
  });
}

async function makeCall(
  groupId: string,
  opts: {
    callType?: 'scheduled' | 'spontaneous';
    endsAt?: Date | null;
    status?: 'scheduled' | 'activating' | 'active' | 'ended';
    endedAt?: Date | null;
  } = {},
) {
  return prisma.callSession.create({
    data: {
      group_id: groupId,
      status: opts.status ?? 'active',
      call_type: opts.callType ?? 'spontaneous',
      started_at: new Date(),
      ends_at: opts.endsAt ?? null,
      ended_at: opts.endedAt ?? null,
      room_name: `presence-room-${Math.random().toString(36).slice(2, 10)}`,
    },
  });
}

function joinCall(callId: string, userId: string) {
  return prisma.callParticipant.create({ data: { call_id: callId, user_id: userId, joined_at: new Date() } });
}

function leaveCall(participantId: string) {
  return prisma.callParticipant.update({ where: { id: participantId }, data: { left_at: new Date() } });
}

function addActivityToken(callId: string, userId: string, pushToken: string) {
  return prisma.callLiveActivityToken.create({ data: { call_id: callId, user_id: userId, push_token: pushToken } });
}

function addAndroidDevice(userId: string, token: string) {
  return prisma.pushDevice.create({ data: { token, user_id: userId, platform: 'android' } });
}

describe('broadcastCallPresence', () => {
  it('sends an update after the debounce window when a participant joins', async () => {
    const owner = await makeUser('join');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-join');

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [tokens, state] = mockUpdate.mock.calls[0];
    expect(tokens).toEqual(['ios-tok-join']);
    expect(state.participantCount).toBe(1);
  });

  it('reflects only left_at: null rows when a participant leaves', async () => {
    const owner = await makeUser('leave1');
    const other = await makeUser('leave2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, other.id);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    const p2 = await joinCall(call.id, other.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-leave');

    await leaveCall(p2.id);
    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][1].participantCount).toBe(1);
  });

  it('broadcasts participantCount 0 for the last leave even though the call is now ended [fix 1]', async () => {
    const owner = await makeUser('lastleave');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id, { callType: 'spontaneous' });
    const participant = await joinCall(call.id, owner.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-last');

    await leaveCall(participant.id);
    await prisma.callSession.update({ where: { id: call.id }, data: { status: 'ended', ended_at: new Date() } });

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][1].participantCount).toBe(0);
  });

  it('does not broadcast for a call that ended more than 60s ago', async () => {
    const owner = await makeUser('oldended');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id, { status: 'ended', endedAt: new Date(Date.now() - 61_000) });
    await addActivityToken(call.id, owner.id, 'ios-tok-old');

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not re-broadcast when a leave and rejoin net to the same count', async () => {
    const owner = await makeUser('rejoin1');
    const other = await makeUser('rejoin2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, other.id);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    const p2 = await joinCall(call.id, other.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-rejoin');

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // Leave and rejoin before the next broadcast is even requested — nets to the
    // same count of 2, so the debounced broadcast below must not fire again.
    await leaveCall(p2.id);
    await joinCall(call.id, other.id);
    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('excludes a muted member\'s activity token from the iOS fan-out', async () => {
    const owner = await makeUser('mutedios1');
    const muted = await makeUser('mutedios2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, muted.id, true);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    await addActivityToken(call.id, owner.id, 'ios-unmuted');
    await addActivityToken(call.id, muted.id, 'ios-muted');

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    const [tokens] = mockUpdate.mock.calls[0];
    expect(tokens).toEqual(['ios-unmuted']);
  });

  it('excludes a muted member\'s devices from the Android fan-out', async () => {
    const owner = await makeUser('mutedand1');
    const muted = await makeUser('mutedand2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, muted.id, true);
    await addAndroidDevice(owner.id, 'and-unmuted');
    await addAndroidDevice(muted.id, 'and-muted');
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    const allTokens = mockSendExpoData.mock.calls.flatMap(([tokens]) => tokens as string[]);
    expect(allTokens).toContain('and-unmuted');
    expect(allTokens).not.toContain('and-muted');
  });

  it('splits Android tokens into ongoing vs dismissible buckets by call membership', async () => {
    const inCallUser = await makeUser('ongoing1');
    const notInCallUser = await makeUser('ongoing2');
    const group = await makeGroupWithOwner(inCallUser.id);
    await addMember(group.id, notInCallUser.id);
    await addAndroidDevice(inCallUser.id, 'and-in-call');
    await addAndroidDevice(notInCallUser.id, 'and-not-in-call');
    const call = await makeCall(group.id);
    await joinCall(call.id, inCallUser.id);

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);

    const ongoingCall = mockSendExpoData.mock.calls.find(([tokens]) => (tokens as string[]).includes('and-in-call'));
    const dismissibleCall = mockSendExpoData.mock.calls.find(([tokens]) =>
      (tokens as string[]).includes('and-not-in-call'));
    expect(ongoingCall?.[1].ongoing).toBe('true');
    expect(dismissibleCall?.[1].ongoing).toBe('false');
  });

  it('still delivers the debounced broadcast after forgetCallPresence runs moments later in the same request', async () => {
    // Mirrors pruneStaleParticipants / the Daily webhook / POST /me/calls/leave: each
    // calls broadcastCallPresence for the last leave, then calls scheduler.closeCall
    // (which calls forgetCallPresence) a few DB round-trips later, still well inside
    // the 1s debounce window. forgetCallPresence must not cancel that pending broadcast.
    const owner = await makeUser('closerace');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id, { callType: 'spontaneous' });
    const participant = await joinCall(call.id, owner.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-closerace');

    await leaveCall(participant.id);
    broadcastCallPresence(call.id);
    await prisma.callSession.update({ where: { id: call.id }, data: { status: 'ended', ended_at: new Date() } });
    forgetCallPresence(call.id);

    await wait(DEBOUNCE_WAIT_MS);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][1].participantCount).toBe(0);
  });

  it('rolls back the recorded count on a failed fan-out so the next broadcast at the same count still fires', async () => {
    const owner = await makeUser('rollback');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    await addActivityToken(call.id, owner.id, 'ios-rollback');

    mockUpdate.mockRejectedValueOnce(new Error('apns down'));
    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    broadcastCallPresence(call.id);
    await wait(DEBOUNCE_WAIT_MS);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('re-arms rather than racing an in-flight broadcast, so the last count still wins [A11]', async () => {
    const owner = await makeUser('inflight1');
    const other = await makeUser('inflight2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, other.id);
    const call = await makeCall(group.id);
    const p1 = await joinCall(call.id, owner.id);
    await joinCall(call.id, other.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-inflight');

    // First run's fan-out hangs for 1.5s — long enough to still be in flight when a
    // second, later-count broadcast's debounce fires.
    mockUpdate.mockImplementationOnce(() => new Promise(resolve =>
      setTimeout(() => resolve({ success: 1, failure: 0, stale: [] }), 1500)));

    broadcastCallPresence(call.id); // count 2 when this run starts ~1s from now
    await wait(1100); // the first run has started and is mid-flight (APNs still pending)

    await leaveCall(p1.id); // true count is now 1
    broadcastCallPresence(call.id); // debounce fires while run #1 is still in flight

    await wait(2700); // covers: re-arm wait + run #1 finishing (~2.5s) + run #2 firing

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1];
    expect(lastCall[1].participantCount).toBe(1);
  });
});

describe('sendPresenceToToken', () => {
  it('seeds a newly registered token with the current count [fix 3]', async () => {
    const owner = await makeUser('seed1');
    const other = await makeUser('seed2');
    const group = await makeGroupWithOwner(owner.id);
    await addMember(group.id, other.id);
    const call = await makeCall(group.id);
    await joinCall(call.id, owner.id);
    await joinCall(call.id, other.id);

    await sendPresenceToToken(call.id, 'seed-token');

    // A spontaneous call's expiry is started_at + SPONTANEOUS_TTL_MS (expiryFor), not
    // undefined — only a call with no started_at at all has no expiry.
    expect(mockUpdate).toHaveBeenCalledWith(
      ['seed-token'],
      expect.objectContaining({ participantCount: 2 }),
      expect.any(Date),
    );
  });

  it('does nothing for a call that is not active', async () => {
    const owner = await makeUser('seedinactive');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id, { status: 'ended', endedAt: new Date() });

    await sendPresenceToToken(call.id, 'seed-token-2');

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('PRESENCE_ENABLED=false', () => {
  afterEach(() => {
    delete process.env.PRESENCE_ENABLED;
  });

  it('sends nothing when the kill switch is off', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env.PRESENCE_ENABLED = 'false';
      const { broadcastCallPresence: isolatedBroadcast } = await import('../services/callPresence.js');

      isolatedBroadcast('non-existent-call-id');
      await wait(DEBOUNCE_WAIT_MS);

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockSendExpoData).not.toHaveBeenCalled();
    });
  });
});

describe('endLiveActivitiesForCall', () => {
  it('sends event: end to every registered token and deletes the token rows', async () => {
    const owner = await makeUser('endjob1');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id);
    await addActivityToken(call.id, owner.id, 'ios-tok-end');

    await endLiveActivitiesForCall(call.id);

    expect(mockEnd).toHaveBeenCalledTimes(1);
    const [tokens] = mockEnd.mock.calls[0];
    expect(tokens).toEqual(['ios-tok-end']);

    const remaining = await prisma.callLiveActivityToken.count({ where: { call_id: call.id } });
    expect(remaining).toBe(0);
  });

  it('sends nothing but still clears token rows when no tokens are registered', async () => {
    const owner = await makeUser('endjob2');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id);

    await endLiveActivitiesForCall(call.id);

    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('runs even when PRESENCE_ENABLED=false — the end job is not a presence update', async () => {
    process.env.PRESENCE_ENABLED = 'false';
    try {
      await jest.isolateModulesAsync(async () => {
        // isolateModulesAsync gives a fresh module registry, so the mocked
        // notifications module must be re-imported here too — asserting against
        // the outer mockEnd would check a different jest.fn() instance. It also
        // freshly re-requires db/prisma.js, opening a second, separate Postgres
        // connection that this file's own afterAll never sees — disconnect it
        // explicitly or it leaks for the rest of the (--runInBand) test run.
        const { endLiveActivitiesForCall: isolatedEnd } = await import('../services/callPresence.js');
        const { notifications: isolatedNotifications } = await import('../services/notifications.js');
        const { prisma: isolatedPrisma } = await import('../db/prisma.js');

        try {
          const owner = await makeUser('endjob3');
          const group = await makeGroupWithOwner(owner.id);
          const call = await makeCall(group.id);
          await addActivityToken(call.id, owner.id, 'ios-tok-end-disabled');

          await isolatedEnd(call.id);

          expect(isolatedNotifications.endLiveActivities).toHaveBeenCalledTimes(1);
          const remaining = await prisma.callLiveActivityToken.count({ where: { call_id: call.id } });
          expect(remaining).toBe(0);
        } finally {
          await isolatedPrisma.$disconnect();
        }
      });
    } finally {
      delete process.env.PRESENCE_ENABLED;
    }
  });

  it('forgets an already-gone call without erroring', async () => {
    await expect(endLiveActivitiesForCall('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
    expect(mockEnd).not.toHaveBeenCalled();
  });
});

describe('scheduler.closeCall [A6]', () => {
  it('ends Live Activities immediately rather than waiting for the delayed end job', async () => {
    const owner = await makeUser('closecall1');
    const group = await makeGroupWithOwner(owner.id);
    const call = await makeCall(group.id, { callType: 'spontaneous' });
    await addActivityToken(call.id, owner.id, 'ios-tok-closecall');

    await scheduler.closeCall(call.id);

    expect(mockEnd).toHaveBeenCalledTimes(1);
    const remaining = await prisma.callLiveActivityToken.count({ where: { call_id: call.id } });
    expect(remaining).toBe(0);

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('ended');
  });
});
