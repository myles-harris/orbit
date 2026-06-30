jest.mock('../services/dailyVideo', () => ({
  buildRoomName: (groupId: string, date: Date) =>
    `test-${groupId}-${date.getTime()}`,
  dailyVideo: {
    createRoom: jest.fn().mockResolvedValue('https://test.daily.co/test-room'),
    roomExists: jest.fn().mockResolvedValue(true),
    deleteRoom: jest.fn().mockResolvedValue(undefined),
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

  it('schedules weekly calls between 8am and 10pm UTC', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id, { cadence: 'weekly', weeklyFrequency: 1 });

    for (let i = 0; i < 5; i++) {
      await prisma.callSession.deleteMany({ where: { group_id: group.id } });
      await scheduler.generateCallsForGroup(group.id, 'weekly', 1);
      const [call] = await prisma.callSession.findMany({
        where: { group_id: group.id },
      });
      const hour = call.scheduled_at!.getHours();
      expect(hour).toBeGreaterThanOrEqual(8);
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

  it('rolls back status to scheduled and rethrows if activateCall fails', async () => {
    const user = await createTestUser();
    const group = await createTestGroup(user.id);
    const call = await createScheduledCall(group.id);

    (dailyVideo.createRoom as jest.Mock).mockRejectedValueOnce(
      new Error('Daily.co API unavailable')
    );

    await expect(scheduler.activateDueCalls()).rejects.toThrow('Daily.co API unavailable');

    const afterFailure = await prisma.callSession.findUnique({ where: { id: call.id } });
    expect(afterFailure!.status).toBe('scheduled');
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
