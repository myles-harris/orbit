/**
 * Unit tests for notification bucketing, APNs payload construction,
 * FCM data messages, and Live Activity push payload.
 * Integration tests for /me notification pref routes.
 */

const mockSendApnsRaw = jest.fn().mockResolvedValue({ ok: true, status: 200 });
jest.mock('../services/apns', () => ({
  sendApnsRaw: (...args: any[]) => mockSendApnsRaw(...args),
  isApnsConfigured: () => true,
  BUNDLE: 'com.mylesharris.orbit',
}));

const mockFcmSend = jest.fn().mockResolvedValue('message-id');
// initializeApp must return something truthy so sendFcm skips the stub path.
// process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON is set in setup.ts so this
// branch is actually reached when notifications.ts loads.
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(() => ({ isMockApp: true })),
  credential: { cert: jest.fn(() => 'mock-cert') },
  messaging: () => ({ send: mockFcmSend }),
}));

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('twilio', () => jest.fn(() => ({})));

// eslint-disable-next-line import/first
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { notifications, callChannelId, CALL_SOUND_IOS, INVITE_PUSH } from '../services/notifications.js';
import type { PushOptions } from '../services/notifications.js';
import { app } from '../app.js';
import { createTestUser, createAccessToken } from './helpers/auth.js';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  mockSendApnsRaw.mockClear();
  mockFcmSend.mockClear();
});

// ─── callChannelId ────────────────────────────────────────────────────────────

describe('callChannelId', () => {
  it('encodes all eight combinations without collision', () => {
    const ids = new Set<string>();
    for (const sound of [true, false]) {
      for (const vibrate of [true, false]) {
        for (const breakFocus of [true, false]) {
          ids.add(callChannelId({ sound, vibrate, breakFocus }));
        }
      }
    }
    expect(ids.size).toBe(8);
  });

  it('produces a -nodnd suffix when breakFocus is false', () => {
    expect(callChannelId({ sound: true, vibrate: true, breakFocus: false })).toMatch(/-nodnd$/);
  });

  it('produces a -dnd suffix when breakFocus is true', () => {
    expect(callChannelId({ sound: true, vibrate: true, breakFocus: true })).toMatch(/-dnd$/);
  });
});

// ─── sendApns ────────────────────────────────────────────────────────────────

describe('sendApns', () => {
  it('sets interruption-level to active for default (untouched) prefs', async () => {
    await notifications.sendApns(['token-a'], 'Test', 'Body');
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(payload.aps['interruption-level']).toBe('active');
  });

  it('sets interruption-level to time-sensitive only when breakFocus is true', async () => {
    await notifications.sendApns(['token-b'], 'Test', 'Body', {}, { breakFocus: true });
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(payload.aps['interruption-level']).toBe('time-sensitive');
  });

  it('sets apns-push-type to alert', async () => {
    await notifications.sendApns(['token-c'], 'Test', 'Body');
    const [, , headers] = mockSendApnsRaw.mock.calls[0];
    expect(headers.pushType).toBe('alert');
  });

  it('omits sound from aps when opts.sound is false', async () => {
    await notifications.sendApns(['token-d'], 'Test', 'Body', {}, { sound: false });
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(payload.aps.sound).toBeUndefined();
  });

  it('defaults iOS sound to the call tone and lets presets override it', async () => {
    await notifications.sendApns(['token-e'], 'T', 'B', {});
    expect(mockSendApnsRaw.mock.calls[0][1].aps.sound).toBe(CALL_SOUND_IOS);
    await notifications.sendApns(['token-f'], 'T', 'B', {}, INVITE_PUSH);
    expect(mockSendApnsRaw.mock.calls[1][1].aps.sound).toBe('default');
  });

  it('stub returns failure count equal to token count when unconfigured', async () => {
    const apnsMock = jest.requireMock('../services/apns') as { isApnsConfigured: () => boolean };
    const orig = apnsMock.isApnsConfigured;
    apnsMock.isApnsConfigured = () => false;
    try {
      const result = await notifications.sendApns(['t1', 't2'], 'Hi', 'Body');
      expect(result.failure).toBe(2);
      expect(result.success).toBe(0);
    } finally {
      apnsMock.isApnsConfigured = orig;
    }
  });
});

// ─── sendFcm ─────────────────────────────────────────────────────────────────

describe('sendFcm', () => {
  it('puts title and body into the data payload for client-side presentation', async () => {
    await notifications.sendFcm(['fcm-token-1'], 'Title', 'Body', { type: 'call_started' });
    const [msg] = mockFcmSend.mock.calls[0];
    expect(msg.data.title).toBe('Title');
    expect(msg.data.body).toBe('Body');
  });

  it('sets android.priority to high', async () => {
    await notifications.sendFcm(['fcm-token-2'], 'T', 'B', {});
    const [msg] = mockFcmSend.mock.calls[0];
    expect(msg.android.priority).toBe('high');
  });

  it('encodes sound and vibrate flags as strings in data', async () => {
    const opts: PushOptions = { sound: false, vibrate: true, breakFocus: false };
    await notifications.sendFcm(['fcm-token-3'], 'T', 'B', {}, opts);
    const [msg] = mockFcmSend.mock.calls[0];
    expect(msg.data.sound).toBe('false');
    expect(msg.data.vibrate).toBe('true');
  });

  it('includes channelId in data payload', async () => {
    const opts: PushOptions = { sound: true, vibrate: true, breakFocus: false };
    await notifications.sendFcm(['fcm-token-4'], 'T', 'B', {}, opts);
    const [msg] = mockFcmSend.mock.calls[0];
    expect(msg.data.channelId).toBe(callChannelId(opts));
  });

  it('honours an explicit channelId override', async () => {
    await notifications.sendFcm(['fcm-token-5'], 'T', 'B', {}, INVITE_PUSH);
    expect(mockFcmSend.mock.calls[0][0].data.channelId).toBe('invites');
  });
});

// ─── sendToBuckets ───────────────────────────────────────────────────────────

describe('sendToBuckets', () => {
  const makeDevice = (token: string, platform: 'ios' | 'android') => ({ token, platform });

  it('calls sendPushTokens once per unique pref combination', async () => {
    const spy = jest.spyOn(notifications, 'sendPushTokens').mockResolvedValue({ success: 1, failure: 0 });

    const members = [
      {
        is_muted: false,
        user: {
          notify_sound: true, notify_vibrate: true, notify_break_focus: false,
          devices: [makeDevice('ios-token-1', 'ios')],
        },
      },
      {
        is_muted: false,
        user: {
          notify_sound: true, notify_vibrate: false, notify_break_focus: false,
          devices: [makeDevice('android-token-1', 'android')],
        },
      },
      {
        is_muted: true,
        user: {
          notify_sound: true, notify_vibrate: true, notify_break_focus: false,
          devices: [makeDevice('muted-token', 'ios')],
        },
      },
    ];

    await notifications.sendToBuckets(members, 'G is calling!', 'Tap to join', { type: 'call_started' });

    expect(spy).toHaveBeenCalledTimes(2);
    const allTokens = spy.mock.calls.flatMap(([tokens]) => tokens.map((t: any) => t.token));
    expect(allTokens).not.toContain('muted-token');

    spy.mockRestore();
  });

  it('passes breakFocus opt correctly to the bucket', async () => {
    const spy = jest.spyOn(notifications, 'sendPushTokens').mockResolvedValue({ success: 1, failure: 0 });

    const members = [
      {
        is_muted: false,
        user: {
          notify_sound: true, notify_vibrate: true, notify_break_focus: true,
          devices: [makeDevice('ios-token-a', 'ios')],
        },
      },
    ];

    await notifications.sendToBuckets(members, 'T', 'B', {});
    // sendPushTokens(tokens, title, body, enrichedData, opts)
    const [, , , , opts] = spy.mock.calls[0] as [any, any, any, any, PushOptions];
    expect(opts.breakFocus).toBe(true);

    spy.mockRestore();
  });
});

// ─── startLiveActivities ─────────────────────────────────────────────────────

describe('startLiveActivities', () => {
  it('sends with liveactivity push type', async () => {
    await notifications.startLiveActivities(
      ['pts-token-1'],
      { callId: 'call-123', groupId: 'group-456' },
      { groupName: 'Test', callType: 'scheduled', endsAtMs: Date.now() + 60_000 },
    );
    const [, , headers] = mockSendApnsRaw.mock.calls[0];
    expect(headers.pushType).toBe('liveactivity');
  });

  it('uses .push-type.liveactivity topic suffix', async () => {
    await notifications.startLiveActivities(
      ['pts-token-2'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'spontaneous' },
    );
    const [, , headers] = mockSendApnsRaw.mock.calls[0];
    expect(headers.topic).toBe('com.mylesharris.orbit.push-type.liveactivity');
  });

  it('sends attributes-type as the bare struct name', async () => {
    await notifications.startLiveActivities(
      ['pts-token-3'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'scheduled' },
    );
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(payload.aps['attributes-type']).toBe('CallActivityAttributes');
  });

  it('sends endsAtMs as a number not a string', async () => {
    const endsAtMs = Date.now() + 900_000;
    await notifications.startLiveActivities(
      ['pts-token-4'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'scheduled', endsAtMs },
    );
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(typeof payload.aps['content-state'].endsAtMs).toBe('number');
    expect(payload.aps['content-state'].endsAtMs).toBe(endsAtMs);
  });

  it('sends aps.timestamp as epoch seconds not milliseconds', async () => {
    const before = Math.floor(Date.now() / 1000);
    await notifications.startLiveActivities(
      ['pts-token-5'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'spontaneous' },
    );
    const after = Math.floor(Date.now() / 1000);
    const [, payload] = mockSendApnsRaw.mock.calls[0];
    expect(payload.aps.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.aps.timestamp).toBeLessThanOrEqual(after);
  });

  it('returns the tokens APNs accepted', async () => {
    mockSendApnsRaw.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await notifications.startLiveActivities(
      ['pts-token-6'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'scheduled' },
    );
    expect(result).toEqual(['pts-token-6']);
  });

  it('excludes a rejected token from the returned array without failing the others', async () => {
    mockSendApnsRaw
      .mockResolvedValueOnce({ ok: false, status: 410, reason: 'Unregistered' })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await notifications.startLiveActivities(
      ['pts-bad', 'pts-good'],
      { callId: 'c', groupId: 'g' },
      { groupName: 'T', callType: 'scheduled' },
    );
    expect(result).toEqual(['pts-good']);
  });

  it('returns [] and logs STUB when APNs is unconfigured', async () => {
    const apnsMock = jest.requireMock('../services/apns') as { isApnsConfigured: () => boolean };
    const orig = apnsMock.isApnsConfigured;
    apnsMock.isApnsConfigured = () => false;
    try {
      const result = await notifications.startLiveActivities(
        ['pts-token-7'],
        { callId: 'c', groupId: 'g' },
        { groupName: 'T', callType: 'scheduled' },
      );
      expect(result).toEqual([]);
    } finally {
      apnsMock.isApnsConfigured = orig;
    }
  });
});

// ─── POST /me/devices/register-live-activity ─────────────────────────────────

describe('POST /me/devices/register-live-activity', () => {
  let userAToken: string;
  let userBToken: string;

  beforeEach(async () => {
    const a = await createTestUser({ username: 'la_user_a' });
    const b = await createTestUser({ username: 'la_user_b' });
    userAToken = createAccessToken(a.id);
    userBToken = createAccessToken(b.id);
    await request(app)
      .post('/me/devices/register-push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ token: 'device-token-a', platform: 'ios' });
    await request(app)
      .post('/me/devices/register-push')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ token: 'device-token-b', platform: 'ios' });
  });

  it('stores pts_token on the matching device', async () => {
    const res = await request(app)
      .post('/me/devices/register-live-activity')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ device_token: 'device-token-a', pts_token: 'pts-hex-token-a' });
    expect(res.status).toBe(200);
    const device = await prisma.pushDevice.findFirst({ where: { token: 'device-token-a' } });
    expect(device?.live_activity_pts_token).toBe('pts-hex-token-a');
  });

  it('does not allow user A to set pts_token on user B device', async () => {
    // User A's auth token, but user B's device_token — update is scoped by user_id so it's a no-op
    await request(app)
      .post('/me/devices/register-live-activity')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ device_token: 'device-token-b', pts_token: 'attacker-token' });
    const device = await prisma.pushDevice.findFirst({ where: { token: 'device-token-b' } });
    expect(device?.live_activity_pts_token).not.toBe('attacker-token');
  });

  it('returns 400 for missing pts_token', async () => {
    const res = await request(app)
      .post('/me/devices/register-live-activity')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ device_token: 'device-token-a' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no device row matches the token', async () => {
    const res = await request(app)
      .post('/me/devices/register-live-activity')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ device_token: 'no-such-device-token', pts_token: 'pts-hex-token' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('device_not_registered');
  });

  it('returns 404 when the device token belongs to a different user (scoped update is a no-op)', async () => {
    const res = await request(app)
      .post('/me/devices/register-live-activity')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ device_token: 'device-token-b', pts_token: 'attacker-token' });
    expect(res.status).toBe(404);
  });
});

// ─── GET /me/calls/active ──────────────────────────────────────────────────

describe('GET /me/calls/active', () => {
  it('returns an empty list when the user has no active calls', async () => {
    const user = await createTestUser({ username: 'active_calls_none' });
    const token = createAccessToken(user.id);

    const res = await request(app)
      .get('/me/calls/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.callIds).toEqual([]);
  });

  it('returns the call id for an active call in one of the user\'s groups', async () => {
    const user = await createTestUser({ username: 'active_calls_member' });
    const token = createAccessToken(user.id);

    const group = await prisma.group.create({
      data: { name: 'Active Calls Group', cadence: 'daily', call_duration_minutes: 30, owner_id: user.id },
    });
    await prisma.groupMember.create({
      data: { group_id: group.id, user_id: user.id, role: 'owner' },
    });
    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'scheduled',
        room_name: `active-calls-room-${group.id}`,
      },
    });

    const res = await request(app)
      .get('/me/calls/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.callIds).toEqual([call.id]);
  });

  it('does not include an active call from a group the user does not belong to', async () => {
    const owner = await prisma.user.create({
      data: {
        phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
        username: `active_calls_owner_${Math.random().toString(36).slice(2, 8)}`,
        time_zone: 'UTC',
      },
    });
    const group = await prisma.group.create({
      data: { name: 'Other Group', cadence: 'daily', call_duration_minutes: 30, owner_id: owner.id },
    });
    await prisma.groupMember.create({
      data: { group_id: group.id, user_id: owner.id, role: 'owner' },
    });
    await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'active',
        call_type: 'scheduled',
        room_name: `other-group-room-${group.id}`,
      },
    });

    const outsider = await createTestUser({ username: 'active_calls_outsider' });
    const token = createAccessToken(outsider.id);

    const res = await request(app)
      .get('/me/calls/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.callIds).toEqual([]);
  });
});

// ─── GET/PATCH /me notification prefs ────────────────────────────────────────

describe('notification prefs via /me', () => {
  let accessToken: string;

  beforeEach(async () => {
    const user = await createTestUser({ username: 'notif_pref_user' });
    accessToken = createAccessToken(user.id);
  });

  it('GET /me returns default pref values', async () => {
    const res = await request(app)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.notify_sound).toBe(true);
    expect(res.body.notify_vibrate).toBe(true);
    expect(res.body.notify_break_focus).toBe(false);
  });

  it('PATCH /me persists notification prefs', async () => {
    const res = await request(app)
      .patch('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ notify_sound: false, notify_break_focus: true });
    expect(res.status).toBe(200);
    expect(res.body.notify_sound).toBe(false);
    expect(res.body.notify_break_focus).toBe(true);
    expect(res.body.notify_vibrate).toBe(true);
  });
});
