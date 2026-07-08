jest.mock('../services/dailyVideo', () => ({
  buildRoomName: (groupId: string, date: Date) =>
    `test-${groupId}-${date.getTime()}`,
  dailyVideo: {
    createRoom: jest.fn().mockResolvedValue('https://test.daily.co/test-room'),
    roomExists: jest.fn().mockResolvedValue(true),
    createMeetingToken: jest.fn().mockResolvedValue('test-meeting-token'),
    deleteRoom: jest.fn().mockResolvedValue(undefined),
    getRoomPresenceCount: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../services/notifications', () => ({
  notifications: {
    sendPushTokens: jest.fn().mockResolvedValue({ success: 1, failure: 0 }),
    sendSilentPushTokens: jest.fn().mockResolvedValue(undefined),
  },
}));

import { PrismaClient } from '@prisma/client';
import { scheduler } from '../services/scheduler.js';
import { dailyVideo } from '../services/dailyVideo.js';
import { notifications } from '../services/notifications.js';
import {
  calendarDateInTz, addDays, randomTimeInWindow, dayBoundsUtc, wallTimeToUtc, SCHEDULE_TZ,
} from '../util/scheduleTime.js';

const prisma = new PrismaClient();

async function createTestUser() {
  return prisma.user.create({
    data: {
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      username: `user_${Math.random().toString(36).slice(2, 8)}`,
      time_zone: 'UTC',
    },
  });
}

async function createTestGroup(ownerId: string, opts: {
  cadence?: 'daily' | 'weekly';
  weeklyFrequency?: number;
  durationMinutes?: number;
} = {}) {
  const group = await prisma.group.create({
    data: {
      name: 'Test Group',
      cadence: opts.cadence ?? 'daily',
      weekly_frequency: opts.weeklyFrequency ?? null,
      call_duration_minutes: opts.durationMinutes ?? 30,
      owner_id: ownerId,
    },
  });
  await prisma.groupMember.create({
    data: { group_id: group.id, user_id: ownerId, role: 'owner' },
  });
  return group;
}

async function createScheduledCall(groupId: string, opts: {
  scheduledAt?: Date;
  endsAt?: Date;
  status?: string;
} = {}) {
  const now = new Date();
  const scheduledAt = opts.scheduledAt ?? new Date(now.getTime() - 30_000);
  const endsAt = opts.endsAt ?? new Date(now.getTime() + 30 * 60_000);
  return prisma.callSession.create({
    data: {
      group_id: groupId,
      status: (opts.status ?? 'scheduled') as any,
      call_type: 'scheduled',
      scheduled_at: scheduledAt,
      ends_at: endsAt,
      room_name: `test-room-${groupId}`,
    },
  });
}

// ─── generateCallsForGroup ─────────────────────────────────────────────────

describe('scheduler.generateCallsForGroup', () => {
  it('creates one call for tomorrow when cadence is daily and none exists', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'daily' });

    await scheduler.generateCallsForGroup(group.id, 'daily', null);

    const calls = await prisma.callSession.findMany({
      where: { group_id: group.id, status: 'scheduled' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].call_type).toBe('scheduled');
  });

  it('does not create a duplicate call if one already exists for tomorrow', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'daily' });

    await scheduler.generateCallsForGroup(group.id, 'daily', null);
    await scheduler.generateCallsForGroup(group.id, 'daily', null);

    const calls = await prisma.callSession.findMany({
      where: { group_id: group.id, status: 'scheduled' },
    });
    expect(calls).toHaveLength(1);
  });

  it('creates N calls spread across different days for weekly cadence', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, {
      cadence: 'weekly',
      weeklyFrequency: 3,
    });

    await scheduler.generateCallsForGroup(group.id, 'weekly', 3);

    const calls = await prisma.callSession.findMany({
      where: { group_id: group.id, status: 'scheduled' },
    });
    expect(calls).toHaveLength(3);

    const days = calls.map((c) => c.scheduled_at!.toISOString().slice(0, 10));
    const uniqueDays = new Set(days);
    expect(uniqueDays.size).toBe(3);
  });

  it('schedules weekly calls between 6am and 10pm Pacific Time', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'weekly', weeklyFrequency: 1 });

    for (let i = 0; i < 5; i++) {
      await prisma.callSession.deleteMany({ where: { group_id: group.id } });
      await scheduler.generateCallsForGroup(group.id, 'weekly', 1);
      const [call] = await prisma.callSession.findMany({
        where: { group_id: group.id },
      });
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false,
      });
      const hour = Number(dtf.formatToParts(call.scheduled_at!).find(p => p.type === 'hour')!.value) % 24;
      expect(hour).toBeGreaterThanOrEqual(6);
      expect(hour).toBeLessThan(22);
    }
  });
});

// ─── activateDueCalls ──────────────────────────────────────────────────────

describe('scheduler.activateDueCalls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('activates a due call: sets status to active, creates room, sends pushes', async () => {
    const user = await createTestUser();
    await prisma.pushDevice.create({
      data: { user_id: user.id, token: 'test-token', platform: 'ios' },
    });
    const group = await createTestGroup(user.id);
    const call = await createScheduledCall(group.id);

    await scheduler.activateDueCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('active');
    expect(updated!.room_url).toBe('https://test.daily.co/test-room');
    expect(dailyVideo.createRoom).toHaveBeenCalledTimes(1);
    expect(notifications.sendPushTokens).toHaveBeenCalledTimes(1);
  });

  it('skips a call whose ends_at has already passed', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const now = new Date();
    await createScheduledCall(group.id, {
      scheduledAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() - 1_000),
    });

    await scheduler.activateDueCalls();

    expect(dailyVideo.createRoom).not.toHaveBeenCalled();
  });

  it('skips a call that is already activating (atomic claim — second caller gets count=0)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createScheduledCall(group.id);

    await prisma.callSession.update({
      where: { id: call.id },
      data: { status: 'activating' },
    });

    await scheduler.activateDueCalls();

    expect(dailyVideo.createRoom).not.toHaveBeenCalled();
    const afterRun = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(afterRun!.status).toBe('activating');
  });

  it('releases claim back to scheduled (claimed_at=null) when activateCall fails, does not rethrow', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createScheduledCall(group.id);

    (dailyVideo.createRoom as jest.Mock).mockRejectedValueOnce(
      new Error('Daily.co API unavailable')
    );

    // B3: no longer rethrows — other due calls should still be processed
    await expect(scheduler.activateDueCalls()).resolves.toBeUndefined();

    const afterFailure = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(afterFailure!.status).toBe('scheduled');
    expect(afterFailure!.claimed_at).toBeNull();
  });

  it('closes an active spontaneous call before activating the scheduled call', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);

    const spontaneous = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'spontaneous',
        room_name: 'spontaneous-room',
        room_url: 'https://test.daily.co/spontaneous',
      },
    });

    const scheduledCall = await createScheduledCall(group.id);

    await scheduler.activateDueCalls();

    const updatedSpontaneous = await prisma.callSession.findUnique({
      where: { id: spontaneous.id },
    });
    const updatedScheduled = await prisma.callSession.findUnique({
      where: { id: scheduledCall.id },
    });

    expect(updatedSpontaneous!.status).toBe('ended');
    expect(updatedScheduled!.status).toBe('active');
  });
});

// ─── closeExpiredCalls ─────────────────────────────────────────────────────

describe('scheduler.closeExpiredCalls', () => {
  it('closes a scheduled call whose ends_at has passed the grace period', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const now = new Date();

    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'scheduled',
        room_name: 'test-room',
        scheduled_at: new Date(now.getTime() - 60_000),
        ends_at: new Date(now.getTime() - 10_000), // expired 10s ago (> 5s grace period)
      },
    });

    await scheduler.closeExpiredCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('ended');
    expect(updated!.ended_at).not.toBeNull();
  });

  it('does NOT close a spontaneous call (those close via /leave endpoint)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const now = new Date();

    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'spontaneous',
        room_name: 'test-room',
        ends_at: new Date(now.getTime() - 10_000),
      },
    });

    await scheduler.closeExpiredCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('active');
  });

  it('does NOT close a scheduled call that has not yet expired', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const now = new Date();

    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'scheduled',
        room_name: 'test-room',
        ends_at: new Date(now.getTime() + 10 * 60_000),
      },
    });

    await scheduler.closeExpiredCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('active');
  });
});

// ─── pruneStaleParticipants ────────────────────────────────────────────────

describe('scheduler.pruneStaleParticipants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (dailyVideo.getRoomPresenceCount as jest.Mock).mockResolvedValue(null);
  });

  async function createActiveSpontaneousCall(groupId: string) {
    return prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'active',
        call_type: 'spontaneous',
        room_name: `spont-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
  }

  async function createParticipant(
    callId: string,
    userId: string,
    opts: { joinedAt?: Date; lastSeenAt?: Date | null } = {},
  ) {
    return prisma.callParticipant.create({
      data: {
        call_id: callId,
        user_id: userId,
        joined_at: opts.joinedAt ?? new Date(),
        last_seen_at: 'lastSeenAt' in opts ? opts.lastSeenAt : null,
      },
    });
  }

  it('does NOT prune participant whose last_seen_at is 30s ago (below 90s cutoff)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, { lastSeenAt: new Date(Date.now() - 30_000) });

    await scheduler.pruneStaleParticipants();

    const p = await prisma.callParticipant.findFirst({ where: { call_id: call.id } });
    expect(p!.left_at).toBeNull();
  });

  it('prunes participant whose last_seen_at is 120s ago', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, { lastSeenAt: new Date(Date.now() - 120_000) });

    await scheduler.pruneStaleParticipants();

    const p = await prisma.callParticipant.findFirst({ where: { call_id: call.id } });
    expect(p!.left_at).not.toBeNull();
  });

  it('prunes participant with null last_seen_at and joined_at 120s ago (legacy-client path)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, {
      joinedAt: new Date(Date.now() - 120_000),
      lastSeenAt: null,
    });

    await scheduler.pruneStaleParticipants();

    const p = await prisma.callParticipant.findFirst({ where: { call_id: call.id } });
    expect(p!.left_at).not.toBeNull();
  });

  it('closes empty spontaneous call when presence returns 0', async () => {
    (dailyVideo.getRoomPresenceCount as jest.Mock).mockResolvedValue(0);

    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, { lastSeenAt: new Date(Date.now() - 120_000) });

    await scheduler.pruneStaleParticipants();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('ended');
  });

  it('does NOT close call when presence returns 2 (real participants still connected), but marks participant left', async () => {
    (dailyVideo.getRoomPresenceCount as jest.Mock).mockResolvedValue(2);

    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, { lastSeenAt: new Date(Date.now() - 120_000) });

    await scheduler.pruneStaleParticipants();

    const updatedCall = await prisma.callSession.findUnique({ where: { id: call.id } });
    const updatedParticipant = await prisma.callParticipant.findFirst({ where: { call_id: call.id } });
    expect(updatedCall!.status).toBe('active');
    expect(updatedParticipant!.left_at).not.toBeNull();
  });

  it('closes call when presence returns null (fail-open behavior)', async () => {
    (dailyVideo.getRoomPresenceCount as jest.Mock).mockResolvedValue(null);

    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createActiveSpontaneousCall(group.id);
    await createParticipant(call.id, user.id, { lastSeenAt: new Date(Date.now() - 120_000) });

    await scheduler.pruneStaleParticipants();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('ended');
  });
});

// ─── activateDueCalls (reclaim + isolation) ────────────────────────────────

describe('scheduler.activateDueCalls (reclaim + isolation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resets a stuck activating call (claimed_at 5min ago, future ends_at) back to scheduled and activates it', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);

    // Start in 'activating' with claimed_at 5 minutes ago (past the 2-min reclaim threshold)
    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'activating',
        call_type: 'scheduled',
        scheduled_at: new Date(Date.now() - 60_000),
        ends_at: new Date(Date.now() + 30 * 60_000),
        room_name: `test-room-${group.id}`,
        claimed_at: new Date(Date.now() - 5 * 60_000),
      },
    });

    await scheduler.activateDueCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('active');
    expect(dailyVideo.createRoom).toHaveBeenCalledTimes(1);
  });

  it('leaves a claim alone when claimed_at is only 30s ago (below 2-min reclaim threshold)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);

    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'activating',
        call_type: 'scheduled',
        scheduled_at: new Date(Date.now() - 60_000),
        ends_at: new Date(Date.now() + 30 * 60_000),
        room_name: `test-room-${group.id}`,
        claimed_at: new Date(Date.now() - 30_000),
      },
    });

    await scheduler.activateDueCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('activating');
    expect(dailyVideo.createRoom).not.toHaveBeenCalled();
  });

  it('marks a stuck activating call ended when ends_at has already passed', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);

    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'activating',
        call_type: 'scheduled',
        scheduled_at: new Date(Date.now() - 90 * 60_000),
        ends_at: new Date(Date.now() - 60_000), // already expired
        room_name: `test-room-${group.id}`,
        claimed_at: new Date(Date.now() - 5 * 60_000),
      },
    });

    await scheduler.activateDueCalls();

    const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(updated!.status).toBe('ended');
    expect(updated!.ended_at).not.toBeNull();
  });

  it('activates the second due call even when activateCall throws for the first', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call1 = await createScheduledCall(group.id);
    const call2 = await createScheduledCall(group.id);

    (dailyVideo.createRoom as jest.Mock)
      .mockRejectedValueOnce(new Error('Room creation failed'))
      .mockResolvedValueOnce('https://test.daily.co/test-room');

    await expect(scheduler.activateDueCalls()).resolves.toBeUndefined();

    const [updated1, updated2] = await Promise.all([
      prisma.callSession.findUnique({ where: { id: call1.id } }),
      prisma.callSession.findUnique({ where: { id: call2.id } }),
    ]);

    const statuses = [updated1!.status, updated2!.status].sort();
    expect(statuses).toEqual(['active', 'scheduled']);

    const released = [updated1!, updated2!].find(c => c.status === 'scheduled');
    expect(released!.claimed_at).toBeNull();
  });
});

// ─── scheduleTime utilities + generateCallsForGroup ───────────────────────

describe('scheduleTime utilities', () => {
  function ptHour(d: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: SCHEDULE_TZ,
      hour: 'numeric',
      hour12: false,
    });
    return Number(dtf.formatToParts(d).find(p => p.type === 'hour')!.value) % 24;
  }

  function ptCalendarDay(d: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: SCHEDULE_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }

  it('randomTimeInWindow: 500 samples for a PDT date all land in [6am, 10pm) PT', () => {
    const datePDT = { year: 2026, monthIndex: 6, day: 15 }; // July 15, 2026 (PDT, UTC-7)
    for (let i = 0; i < 500; i++) {
      const t = randomTimeInWindow(datePDT);
      const h = ptHour(t);
      expect(h).toBeGreaterThanOrEqual(6);
      expect(h).toBeLessThan(22);
    }
  });

  it.each([
    ['PDT (UTC-7)', { year: 2026, monthIndex: 6, day: 15 }],
    ['PST (UTC-8)', { year: 2026, monthIndex: 0, day: 15 }],
    ['spring-forward date', { year: 2026, monthIndex: 2, day: 8 }],
    ['fall-back date', { year: 2026, monthIndex: 10, day: 1 }],
  ])('randomTimeInWindow on %s: 100 samples all in [6am, 10pm) PT', (_label, d) => {
    for (let i = 0; i < 100; i++) {
      const t = randomTimeInWindow(d);
      const h = ptHour(t);
      expect(h).toBeGreaterThanOrEqual(6);
      expect(h).toBeLessThan(22);
    }
  });

  it('daily cadence: existing call at 6:30 AM PT tomorrow prevents duplicate (TZ-safe)', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'daily' });

    const tomorrowPT = addDays(calendarDateInTz(new Date()), 1);
    const existingTime = wallTimeToUtc(tomorrowPT.year, tomorrowPT.monthIndex, tomorrowPT.day, 6 * 60 + 30);

    await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: existingTime,
        ends_at: new Date(existingTime.getTime() + 30 * 60_000),
        room_name: 'existing-room',
      },
    });

    await scheduler.generateCallsForGroup(group.id, 'daily', null);

    const calls = await prisma.callSession.findMany({
      where: { group_id: group.id, status: 'scheduled' },
    });
    expect(calls).toHaveLength(1);
  });

  it('weekly cadence: generated calls are on distinct PT calendar days, all within window', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'weekly', weeklyFrequency: 3 });

    await scheduler.generateCallsForGroup(group.id, 'weekly', 3);

    const calls = await prisma.callSession.findMany({
      where: { group_id: group.id, status: 'scheduled' },
    });
    expect(calls).toHaveLength(3);

    for (const call of calls) {
      const h = ptHour(call.scheduled_at!);
      expect(h).toBeGreaterThanOrEqual(6);
      expect(h).toBeLessThan(22);
    }

    const ptDays = calls.map(c => ptCalendarDay(c.scheduled_at!));
    expect(new Set(ptDays).size).toBe(3);
  });
});
