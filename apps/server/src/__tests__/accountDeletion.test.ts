// ─── Mocks (hoisted before imports) ─────────────────────────────────────────
// Copied from api.test.ts:10-50 so the deletion service's network calls never leave
// this process.

jest.mock('../services/dailyVideo', () => ({
  buildRoomName: (groupId: string, date: Date) =>
    `test-${groupId}-${date.getTime()}`,
  dailyVideo: {
    createRoom: jest.fn().mockResolvedValue('https://test.daily.co/test-room'),
    roomExists: jest.fn().mockResolvedValue(true),
    createMeetingToken: jest.fn().mockResolvedValue('test_meeting_token'),
    deleteRoom: jest.fn().mockResolvedValue(undefined),
    getRoomPresenceCount: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../services/notifications', () => ({
  notifications: {
    sendPushTokens: jest.fn().mockResolvedValue({ success: 0, failure: 0 }),
    sendToBuckets: jest.fn().mockResolvedValue({ success: 0, failure: 0 }),
    startLiveActivities: jest.fn().mockResolvedValue([]),
    updateLiveActivities: jest.fn().mockResolvedValue({ success: 0, failure: 0, stale: [] }),
    endLiveActivities: jest.fn().mockResolvedValue(undefined),
    sendExpoData: jest.fn().mockResolvedValue({ success: 0, failure: 0 }),
  },
  INVITE_PUSH: { channelId: 'invites', soundName: 'default' },
}));

jest.mock('../services/twilioVerify', () => ({
  twilioVerify: {
    requestOtp: jest.fn().mockResolvedValue(undefined),
    verifyOtp: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../services/scheduler', () => ({
  scheduler: {
    generateCallsForGroup: jest.fn().mockResolvedValue(undefined),
    generateScheduledCalls: jest.fn().mockResolvedValue(undefined),
    activateDueCalls: jest.fn().mockResolvedValue(undefined),
    closeExpiredCalls: jest.fn().mockResolvedValue(undefined),
    closeCall: jest.fn().mockResolvedValue(undefined),
    scheduleInitialCallForGroup: jest.fn().mockResolvedValue(undefined),
  },
}));

// Leaving out resetCallPresenceState breaks every test in the file: setup.ts's
// afterEach always calls it, and a mock module with no such export throws there.
jest.mock('../services/callPresence', () => ({
  broadcastCallPresence: jest.fn(),
  sendPresenceToToken: jest.fn().mockResolvedValue(undefined),
  forgetCallPresence: jest.fn(),
  endLiveActivitiesForCall: jest.fn().mockResolvedValue(undefined),
  resetCallPresenceState: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';
import { broadcastCallPresence } from '../services/callPresence.js';
import { createTestUserWithToken, createRefreshToken } from './helpers/auth.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createGroupDirect(ownerId: string, name = 'Test Group') {
  return prisma.group.create({ data: { name, owner_id: ownerId, cadence: 'daily' } });
}

async function addMember(
  groupId: string,
  userId: string,
  opts: { role?: 'owner' | 'member'; joinedAt?: Date } = {},
) {
  return prisma.groupMember.create({
    data: {
      group_id: groupId,
      user_id: userId,
      role: opts.role ?? 'member',
      ...(opts.joinedAt ? { joined_at: opts.joinedAt } : {}),
    },
  });
}

async function createActiveCall(groupId: string) {
  return prisma.callSession.create({
    data: { group_id: groupId, status: 'active', call_type: 'spontaneous', started_at: new Date() },
  });
}

describe('DELETE /me', () => {
  beforeEach(() => {
    (scheduler.closeCall as jest.Mock).mockClear();
    (broadcastCallPresence as jest.Mock).mockClear();
  });

  it('1. returns 401 without a token', async () => {
    const res = await request(app).delete('/me');
    expect(res.status).toBe(401);
  });

  it('2. deletes a user with no groups, and revokes every token', async () => {
    const { user, token } = await createTestUserWithToken();

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });

    const getMe = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(getMe.status).toBe(401);
    expect(getMe.body).toEqual({ error: 'user_not_found' });

    const refresh = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: createRefreshToken(user.id) });
    expect(refresh.status).toBe(401);
  });

  it('3. transfers an owned group to the earliest-joined member and clears the photo', async () => {
    const { user: owner, token } = await createTestUserWithToken();
    const { user: b } = await createTestUserWithToken();
    const { user: c } = await createTestUserWithToken();
    const group = await createGroupDirect(owner.id);
    await addMember(group.id, owner.id, { role: 'owner', joinedAt: new Date(Date.now() - 10_000) });
    await addMember(group.id, b.id, { role: 'member', joinedAt: new Date(Date.now() - 5_000) });
    await addMember(group.id, c.id, { role: 'member', joinedAt: new Date() });
    await prisma.group.update({
      where: { id: group.id },
      data: { photo: Buffer.from('fake-jpeg'), photo_mime_type: 'image/jpeg', photo_updated_at: new Date() },
    });

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updatedGroup = await prisma.group.findUnique({ where: { id: group.id } });
    expect(updatedGroup?.owner_id).toBe(b.id);
    expect(updatedGroup?.photo).toBeNull();
    expect(updatedGroup?.photo_mime_type).toBeNull();
    expect(updatedGroup?.photo_updated_at).toBeNull();

    const memberships = await prisma.groupMember.findMany({ where: { group_id: group.id } });
    expect(memberships.find(m => m.user_id === b.id)?.role).toBe('owner');
    expect(memberships.find(m => m.user_id === c.id)?.role).toBe('member');
  });

  it('4. breaks a joined_at tie by the lower GroupMember.id', async () => {
    const { user: owner, token } = await createTestUserWithToken();
    const { user: b } = await createTestUserWithToken();
    const { user: c } = await createTestUserWithToken();
    const group = await createGroupDirect(owner.id);
    const tieTime = new Date();
    await addMember(group.id, owner.id, { role: 'owner', joinedAt: new Date(tieTime.getTime() - 1_000) });
    const memberB = await addMember(group.id, b.id, { role: 'member', joinedAt: tieTime });
    const memberC = await addMember(group.id, c.id, { role: 'member', joinedAt: tieTime });
    const expectedSuccessorUserId = memberB.id < memberC.id ? b.id : c.id;

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updatedGroup = await prisma.group.findUnique({ where: { id: group.id } });
    expect(updatedGroup?.owner_id).toBe(expectedSuccessorUserId);
  });

  it('5. deletes a group whose only member is the owner, closing its active call first', async () => {
    const { user: owner, token } = await createTestUserWithToken();
    const group = await createGroupDirect(owner.id);
    await addMember(group.id, owner.id, { role: 'owner' });
    const call = await createActiveCall(group.id);

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await prisma.group.findUnique({ where: { id: group.id } })).toBeNull();
    expect(scheduler.closeCall).toHaveBeenCalledWith(call.id);
  });

  it('6. leaves a group the user only belongs to intact', async () => {
    const { user: owner } = await createTestUserWithToken();
    const { user: member, token } = await createTestUserWithToken();
    const group = await createGroupDirect(owner.id);
    await addMember(group.id, owner.id, { role: 'owner' });
    await addMember(group.id, member.id, { role: 'member' });

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const updatedGroup = await prisma.group.findUnique({ where: { id: group.id } });
    expect(updatedGroup?.owner_id).toBe(owner.id);

    const membership = await prisma.groupMember.findFirst({ where: { group_id: group.id, user_id: member.id } });
    expect(membership).toBeNull();
    const ownerMembership = await prisma.groupMember.findFirst({ where: { group_id: group.id, user_id: owner.id } });
    expect(ownerMembership).not.toBeNull();
  });

  it('7. deletes invites created or received, and keeps a used invite with used_by cleared', async () => {
    const { user: other } = await createTestUserWithToken();
    const { user: deleting, token } = await createTestUserWithToken();
    const group = await createGroupDirect(other.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await prisma.invite.create({
      data: { group_id: group.id, created_by: deleting.id, expires_at: expiresAt },
    });
    const received = await prisma.invite.create({
      data: {
        group_id: group.id,
        created_by: other.id,
        invited_user_id: deleting.id,
        status: 'pending',
        expires_at: expiresAt,
      },
    });
    const used = await prisma.invite.create({
      data: {
        group_id: group.id,
        created_by: other.id,
        used_by: deleting.id,
        used_at: new Date(),
        expires_at: expiresAt,
      },
    });

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await prisma.invite.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await prisma.invite.findUnique({ where: { id: received.id } })).toBeNull();
    const survivingInvite = await prisma.invite.findUnique({ where: { id: used.id } });
    expect(survivingInvite).not.toBeNull();
    expect(survivingInvite?.used_by).toBeNull();
  });

  it('8. removes the user\'s PushDevice, CallLiveActivityToken, and CallParticipant rows', async () => {
    const { user: other } = await createTestUserWithToken();
    const { user: deleting, token } = await createTestUserWithToken();
    const group = await createGroupDirect(other.id);
    await addMember(group.id, other.id, { role: 'owner' });
    await addMember(group.id, deleting.id, { role: 'member' });
    const call = await createActiveCall(group.id);

    await prisma.pushDevice.create({ data: { token: 'push-token-1', user_id: deleting.id, platform: 'ios' } });
    await prisma.callLiveActivityToken.create({
      data: { call_id: call.id, user_id: deleting.id, push_token: 'activity-token-1' },
    });
    await prisma.callParticipant.create({ data: { call_id: call.id, user_id: deleting.id } });

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(await prisma.pushDevice.findMany({ where: { user_id: deleting.id } })).toHaveLength(0);
    expect(await prisma.callLiveActivityToken.findMany({ where: { user_id: deleting.id } })).toHaveLength(0);
    expect(await prisma.callParticipant.findMany({ where: { user_id: deleting.id } })).toHaveLength(0);
  });

  it('9. broadcasts presence for an active call in another group the user had joined', async () => {
    const { user: other } = await createTestUserWithToken();
    const { user: deleting, token } = await createTestUserWithToken();
    const group = await createGroupDirect(other.id);
    await addMember(group.id, other.id, { role: 'owner' });
    await addMember(group.id, deleting.id, { role: 'member' });
    const call = await createActiveCall(group.id);
    await prisma.callParticipant.create({ data: { call_id: call.id, user_id: deleting.id, left_at: null } });

    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(broadcastCallPresence).toHaveBeenCalledWith(call.id);
  });

  it('10. two concurrent DELETE /me calls never return 500', async () => {
    const { user, token } = await createTestUserWithToken();

    const [r1, r2] = await Promise.all([
      request(app).delete('/me').set('Authorization', `Bearer ${token}`),
      request(app).delete('/me').set('Authorization', `Bearer ${token}`),
    ]);

    for (const r of [r1, r2]) {
      expect(r.status).not.toBe(500);
      expect([200, 401]).toContain(r.status);
    }
    expect([r1.status, r2.status]).toContain(200);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('11. rolls back and returns 500 when the transaction fails', async () => {
    const { user: other } = await createTestUserWithToken();
    const { user: deleting, token } = await createTestUserWithToken();
    const group = await createGroupDirect(deleting.id);
    await addMember(group.id, deleting.id, { role: 'owner' });
    await addMember(group.id, other.id, { role: 'member' });
    const invite = await prisma.invite.create({
      data: {
        group_id: group.id,
        created_by: deleting.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const spy = jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).delete('/me').set('Authorization', `Bearer ${token}`);
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_server_error' });

    expect(await prisma.user.findUnique({ where: { id: deleting.id } })).not.toBeNull();
    expect(await prisma.group.findUnique({ where: { id: group.id } })).not.toBeNull();
    expect(await prisma.invite.findUnique({ where: { id: invite.id } })).not.toBeNull();
  });
});
