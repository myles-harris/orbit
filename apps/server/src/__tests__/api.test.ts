/**
 * Comprehensive backend API test suite.
 * Covers all HTTP endpoints across auth, me, users, groups, calls, and svc routers.
 *
 * External services are mocked so no real Twilio / Daily.co / push calls are made.
 */

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────

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
  },
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

// ─── Imports ─────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../app.js';
import { scheduler } from '../services/scheduler.js';
import {
  createTestUser,
  createTestUserWithToken,
  createRefreshToken,
} from './helpers/auth.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev';

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function createGroup(
  token: string,
  opts: { name?: string; cadence?: 'daily' | 'weekly'; duration?: number; weeklyFrequency?: number } = {}
) {
  const body: Record<string, unknown> = {
    name: opts.name ?? 'Test Group',
    cadence: opts.cadence ?? 'daily',
    call_duration_minutes: opts.duration ?? 5,
  };
  if (opts.cadence === 'weekly') {
    body.weekly_frequency = opts.weeklyFrequency ?? 2;
  }
  const res = await request(app)
    .post('/groups')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body as {
    id: string;
    name: string;
    owner_id: string;
    cadence: string;
    call_duration_minutes: number;
    member_count: number;
  };
}

async function createActiveCall(groupId: string) {
  const startedAt = new Date();
  const roomName = `test-room-${groupId}`;
  return prisma.callSession.create({
    data: {
      group_id: groupId,
      status: 'active',
      call_type: 'spontaneous',
      started_at: startedAt,
      ends_at: null,
      room_name: roomName,
      room_url: `https://test.daily.co/${roomName}`,
    },
  });
}

async function createScheduledCallRecord(groupId: string, scheduledAt: Date, durationMinutes = 5) {
  const roomName = `scheduled-${groupId}-${scheduledAt.getTime()}`;
  return prisma.callSession.create({
    data: {
      group_id: groupId,
      status: 'scheduled',
      call_type: 'scheduled',
      scheduled_at: scheduledAt,
      ends_at: new Date(scheduledAt.getTime() + durationMinutes * 60_000),
      room_name: roomName,
    },
  });
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth endpoints', () => {
  describe('POST /auth/request-otp', () => {
    it('returns status sent for a valid phone number', async () => {
      const res = await request(app)
        .post('/auth/request-otp')
        .send({ phone: '+15550001111' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('sent');
    });

    it('returns 400 when phone is missing', async () => {
      const res = await request(app).post('/auth/request-otp').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/verify-otp — new user', () => {
    it('returns is_new_user true and a signup_token when phone has no account', async () => {
      const res = await request(app)
        .post('/auth/verify-otp')
        .send({ phone: '+15559990000', code: '123456' });
      expect(res.status).toBe(200);
      expect(res.body.is_new_user).toBe(true);
      expect(res.body.signup_token).toBeDefined();
    });
  });

  describe('POST /auth/verify-otp — existing user', () => {
    it('returns access and refresh tokens for an existing user', async () => {
      const phone = '+15551234567';
      await createTestUser({ phone, username: 'existingverify' });

      const res = await request(app)
        .post('/auth/verify-otp')
        .send({ phone, code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.is_new_user).toBe(false);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.user.phone).toBe(phone);
    });

    it('returns 401 when OTP verification fails', async () => {
      const { twilioVerify } = jest.requireMock('../services/twilioVerify');
      twilioVerify.verifyOtp.mockResolvedValueOnce(false);

      const res = await request(app)
        .post('/auth/verify-otp')
        .send({ phone: '+15559991234', code: 'badcod' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_code');
    });

    it('returns 400 when body is missing fields', async () => {
      const res = await request(app)
        .post('/auth/verify-otp')
        .send({ phone: '+15550000000' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/complete-signup', () => {
    it('creates a new user with a valid signup token', async () => {
      const phone = '+15551000001';
      const signupToken = jwt.sign({ type: 'signup', phone }, JWT_SECRET, { expiresIn: 600 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: signupToken, username: 'freshuser' });

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('freshuser');
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
    });

    it('returns 409 when username is already taken', async () => {
      await createTestUser({ username: 'taken_name' });
      const signupToken = jwt.sign({ type: 'signup', phone: '+15552000002' }, JWT_SECRET, { expiresIn: 600 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: signupToken, username: 'taken_name' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('username_taken');
    });

    it('returns 401 with an expired signup token', async () => {
      const signupToken = jwt.sign({ type: 'signup', phone: '+15553000003' }, JWT_SECRET, { expiresIn: -1 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: signupToken, username: 'expired_user' });

      expect(res.status).toBe(401);
    });

    it('returns 401 with a non-signup token type', async () => {
      const badToken = jwt.sign({ type: 'access', phone: '+15550000000' }, JWT_SECRET, { expiresIn: 600 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: badToken, username: 'wrongtype' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when username is missing', async () => {
      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: 'sometoken' });
      expect(res.status).toBe(400);
    });

    it('seeds the provided IANA timezone at account creation (WS-5)', async () => {
      const phone = '+15554000004';
      const signupToken = jwt.sign({ type: 'signup', phone }, JWT_SECRET, { expiresIn: 600 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: signupToken, username: 'tzuser', time_zone: 'America/Chicago' });

      expect(res.status).toBe(200);
      expect(res.body.user.time_zone).toBe('America/Chicago');
    });

    it('defaults to UTC when no timezone is provided (WS-5)', async () => {
      const phone = '+15554000005';
      const signupToken = jwt.sign({ type: 'signup', phone }, JWT_SECRET, { expiresIn: 600 });

      const res = await request(app)
        .post('/auth/complete-signup')
        .send({ signup_token: signupToken, username: 'notzuser' });

      expect(res.status).toBe(200);
      expect(res.body.user.time_zone).toBe('UTC');
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns new tokens with a valid refresh token', async () => {
      const user = await createTestUser();
      const refreshToken = createRefreshToken(user.id);

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
    });

    it('returns 401 with an invalid token string', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'not-a-token' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when the user no longer exists', async () => {
      const refreshToken = createRefreshToken('00000000-0000-0000-0000-000000000000');

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('user_not_found');
    });

    it('returns 400 when body is missing the refresh_token field', async () => {
      const res = await request(app).post('/auth/refresh').send({});
      expect(res.status).toBe(400);
    });
  });
});

// ─── Me ──────────────────────────────────────────────────────────────────────

describe('Me endpoints', () => {
  describe('GET /me', () => {
    it('returns the authenticated user profile', async () => {
      const { user, token } = await createTestUserWithToken({ username: 'meuser' });

      const res = await request(app)
        .get('/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.username).toBe('meuser');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /me', () => {
    it('updates the username', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'updated_name' });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('updated_name');
    });

    it('updates the time zone', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ time_zone: 'America/New_York' });

      expect(res.status).toBe(200);
      expect(res.body.time_zone).toBe('America/New_York');
    });

    it('returns 400 for an empty username', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid timezone (WS-5)', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ time_zone: 'Not/A/Timezone' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).patch('/me').send({ username: 'x' });
      expect(res.status).toBe(401);
    });
  });

  describe('WS-2: avatar upload / download', () => {
    // 1x1 PNG in base64 (smallest valid PNG)
    const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    /** Minimal structurally-valid JPEG: SOI + APP0/JFIF header, padded to `bytes`. */
    const jpegOfSize = (bytes: number) => {
      const header = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length))]);
    };

    const putAvatar = (token: string, buf: Buffer, mime = 'image/jpeg') =>
      request(app)
        .put('/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: buf.toString('base64'), mime_type: mime });

    it('returns has_avatar: false for a new user', async () => {
      const { token } = await createTestUserWithToken();
      const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.has_avatar).toBe(false);
    });

    it('PUT /me/avatar stores the avatar and has_avatar becomes true', async () => {
      const { user, token } = await createTestUserWithToken();

      const uploadRes = await request(app)
        .put('/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/png' });
      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.ok).toBe(true);

      const meRes = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.body.has_avatar).toBe(true);

      const avatarRes = await request(app)
        .get(`/users/${user.id}/avatar`)
        .set('Authorization', `Bearer ${token}`);
      expect(avatarRes.status).toBe(200);
      expect(avatarRes.headers['content-type']).toMatch(/image\/png/);
      expect(avatarRes.body).toBeTruthy();
    });

    it('DELETE /me/avatar clears the avatar and has_avatar becomes false', async () => {
      const { user, token } = await createTestUserWithToken();

      await request(app)
        .put('/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/png' });

      const deleteRes = await request(app)
        .delete('/me/avatar')
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      const meRes = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.body.has_avatar).toBe(false);

      const avatarRes = await request(app)
        .get(`/users/${user.id}/avatar`)
        .set('Authorization', `Bearer ${token}`);
      expect(avatarRes.status).toBe(404);
    });

    it('PUT /me/avatar rejects an unsupported mime type', async () => {
      const { token } = await createTestUserWithToken();
      const res = await request(app)
        .put('/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/bmp' });
      expect(res.status).toBe(400);
    });

    it('PUT /me/avatar rejects a payload exceeding the 2 MB cap', async () => {
      const { token } = await createTestUserWithToken();
      const res = await putAvatar(token, jpegOfSize(2 * 1024 * 1024 + 1));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('avatar_too_large');
    });

    it('PUT /me/avatar accepts a 300 KB image (regression: cap was 200 KB)', async () => {
      const { token } = await createTestUserWithToken();
      const res = await putAvatar(token, jpegOfSize(300 * 1024));
      expect(res.status).toBe(200);
      expect(res.body.avatar_updated_at).toEqual(expect.any(String));
    });

    it('PUT /me/avatar accepts an image just under the 2 MB cap', async () => {
      const { token } = await createTestUserWithToken();
      expect((await putAvatar(token, jpegOfSize(2 * 1024 * 1024 - 1))).status).toBe(200);
    });

    it('GET /me never returns the avatar blob', async () => {
      const { token } = await createTestUserWithToken();
      await request(app).put('/me/avatar').set('Authorization', `Bearer ${token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/png' });

      const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('avatar');
      expect(res.body.has_avatar).toBe(true);
      expect(res.body.avatar_updated_at).toEqual(expect.any(String));
    });

    it('GET /users/:id/avatar is immutable-cacheable when versioned and 304s on ETag', async () => {
      const { user, token } = await createTestUserWithToken();
      const upload = await request(app).put('/me/avatar').set('Authorization', `Bearer ${token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/png' });
      const version = new Date(upload.body.avatar_updated_at).getTime();

      const versioned = await request(app)
        .get(`/users/${user.id}/avatar?v=${version}`)
        .set('Authorization', `Bearer ${token}`);
      expect(versioned.status).toBe(200);
      expect(versioned.headers['cache-control']).toContain('immutable');
      expect(versioned.headers['etag']).toBe(`"${version}"`);

      const unversioned = await request(app)
        .get(`/users/${user.id}/avatar`)
        .set('Authorization', `Bearer ${token}`);
      expect(unversioned.headers['cache-control']).not.toContain('immutable');

      const conditional = await request(app)
        .get(`/users/${user.id}/avatar?v=${version}`)
        .set('Authorization', `Bearer ${token}`)
        .set('If-None-Match', `"${version}"`);
      expect(conditional.status).toBe(304);
    });

    it('GET /users/search includes has_avatar and no avatar blob', async () => {
      const { token } = await createTestUserWithToken({ username: 'searcher_ws2' });
      const { user: target } = await createTestUserWithToken({ username: 'target_ws2' });

      const res = await request(app)
        .get('/users/search?q=target_ws2')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const found = res.body.users.find((u: any) => u.id === target.id);
      expect(found).toBeDefined();
      expect(found.has_avatar).toBe(false);
      expect(found).not.toHaveProperty('avatar');
    });
  });

  describe('POST /me/devices/register-push', () => {
    it('registers a push device token', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'device-token-abc', platform: 'ios' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('registered');
    });

    it('upserts when the same device token is re-registered', async () => {
      const { token } = await createTestUserWithToken();

      await request(app)
        .post('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'shared-device-token', platform: 'ios' });

      const res = await request(app)
        .post('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'shared-device-token', platform: 'android' });

      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid platform', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .send({ token: 'x', platform: 'windows' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/me/devices/register-push')
        .send({ token: 'x', platform: 'ios' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /me/devices/register-push', () => {
    it('unregisters a device token', async () => {
      const { user, token } = await createTestUserWithToken();

      await prisma.pushDevice.create({
        data: { token: 'del-device-token', user_id: user.id, platform: 'ios' },
      });

      const res = await request(app)
        .delete('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .query({ token: 'del-device-token' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unregistered');
    });

    it('returns 200 gracefully even when token does not exist', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .delete('/me/devices/register-push')
        .set('Authorization', `Bearer ${token}`)
        .query({ token: 'nonexistent-token' });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /me/invitations', () => {
    it('returns empty list when no pending invitations', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .get('/me/invitations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.invitations).toEqual([]);
    });

    it('returns pending invitations for the user', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: invitee, token: inviteeToken } = await createTestUserWithToken();

      const group = await createGroup(ownerToken);

      // Create a direct invitation
      await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invitee.username });

      const res = await request(app)
        .get('/me/invitations')
        .set('Authorization', `Bearer ${inviteeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.invitations).toHaveLength(1);
      expect(res.body.invitations[0].group.id).toBe(group.id);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/me/invitations');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /me/calls/leave', () => {
    it('marks open participations older than 60s as left', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);
      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date(Date.now() - 61_000) },
      });

      const res = await request(app)
        .post('/me/calls/leave')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const updated = await prisma.callParticipant.findFirst({ where: { call_id: call.id, user_id: user.id } });
      expect(updated?.left_at).not.toBeNull();
    });

    it('A5: does not touch a participation created within the 60s grace window', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);
      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date(Date.now() - 10_000) },
      });

      const res = await request(app)
        .post('/me/calls/leave')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const unchanged = await prisma.callParticipant.findFirst({ where: { call_id: call.id, user_id: user.id } });
      expect(unchanged?.left_at).toBeNull();
    });

    it('presence guard: does not close call when Daily still reports connected participants', async () => {
      const { dailyVideo: mockDaily } = jest.requireMock('../services/dailyVideo');
      const { scheduler: mockScheduler } = jest.requireMock('../services/scheduler');
      mockDaily.getRoomPresenceCount.mockResolvedValueOnce(1);
      mockScheduler.closeCall.mockClear();

      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);
      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date(Date.now() - 61_000) },
      });

      await request(app).post('/me/calls/leave').set('Authorization', `Bearer ${token}`);

      const still = await prisma.callSession.findUnique({ where: { id: call.id } });
      expect(still?.status).toBe('active');
      expect(mockScheduler.closeCall).not.toHaveBeenCalled();
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).post('/me/calls/leave');
      expect(res.status).toBe(401);
    });
  });
});

// ─── Users ────────────────────────────────────────────────────────────────────

describe('Users endpoints', () => {
  describe('GET /users/search', () => {
    it('returns matching users by username', async () => {
      const { token } = await createTestUserWithToken();
      await createTestUser({ username: 'searchable_alice' });
      await createTestUser({ username: 'searchable_bob' });

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'searchable' });

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
      expect(res.body.users.every((u: any) => u.username.includes('searchable'))).toBe(true);
    });

    it('excludes the requesting user from results', async () => {
      const { user, token } = await createTestUserWithToken({ username: 'self_searcher' });

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'self_searcher' });

      expect(res.status).toBe(200);
      expect(res.body.users.find((u: any) => u.id === user.id)).toBeUndefined();
    });

    it('returns status field for group members and pending invitees when groupId is provided', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: member } = await createTestUserWithToken({ username: 'already_member_xyz' });
      const { user: invited } = await createTestUserWithToken({ username: 'already_invited_xyz' });

      // Create group
      const group = await createGroup(ownerToken);

      // Add member directly to DB
      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      // Invite the other user (pending)
      await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invited.username });

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${ownerToken}`)
        .query({ q: 'xyz', groupId: group.id });

      expect(res.status).toBe(200);
      const users = res.body.users as Array<{ id: string; status: string | null }>;
      const memberResult = users.find((u) => u.id === member.id);
      const invitedResult = users.find((u) => u.id === invited.id);
      expect(memberResult).toBeDefined();
      expect(memberResult!.status).toBe('member');
      expect(invitedResult).toBeDefined();
      expect(invitedResult!.status).toBe('invited');
    });

    it('returns 403 when groupId is provided but caller is not a member (WS-4)', async () => {
      const { token: outsiderToken } = await createTestUserWithToken();
      const { token: ownerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .query({ q: 'test', groupId: group.id });

      expect(res.status).toBe(403);
    });

    it('trims leading/trailing whitespace from query (WS-4)', async () => {
      const { token } = await createTestUserWithToken();
      await createTestUser({ username: 'trimtest_user' });

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: '  trimtest  ' });

      expect(res.status).toBe(200);
      expect(res.body.users.some((u: any) => u.username === 'trimtest_user')).toBe(true);
    });

    it('returns 400 when query is less than 2 characters', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .get('/users/search')
        .set('Authorization', `Bearer ${token}`)
        .query({ q: 'a' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .get('/users/search')
        .query({ q: 'test' });
      expect(res.status).toBe(401);
    });
  });
});

// ─── Groups ───────────────────────────────────────────────────────────────────

describe('Groups endpoints', () => {
  describe('POST /groups', () => {
    it('creates a daily group and returns 201', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Morning Crew', cadence: 'daily', call_duration_minutes: 5 });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Morning Crew');
      expect(res.body.cadence).toBe('daily');
      expect(res.body.member_count).toBe(1);
    });

    it('creates a weekly group with frequency', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Book Club', cadence: 'weekly', weekly_frequency: 2, call_duration_minutes: 30 });

      expect(res.status).toBe(201);
      expect(res.body.weekly_frequency).toBe(2);
    });

    it('returns 400 when required fields are missing', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Incomplete' });

      expect(res.status).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/groups')
        .send({ name: 'X', cadence: 'daily', call_duration_minutes: 5 });
      expect(res.status).toBe(401);
    });

    it('stores and returns a custom call window (WS-7)', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Late Night Crew', cadence: 'daily', call_duration_minutes: 30, call_window_start: 20, call_window_end: 23 });

      expect(res.status).toBe(201);
      expect(res.body.call_window_start).toBe(20);
      expect(res.body.call_window_end).toBe(23);
    });

    it('defaults call window to 6–22 when not provided (WS-7)', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Default Window Group', cadence: 'daily', call_duration_minutes: 30 });

      expect(res.status).toBe(201);
      expect(res.body.call_window_start).toBe(6);
      expect(res.body.call_window_end).toBe(22);
    });

    it('calls scheduleInitialCallForGroup after creation (WS-8)', async () => {
      const { token } = await createTestUserWithToken();
      (scheduler.scheduleInitialCallForGroup as jest.Mock).mockClear();

      const res = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'WS-8 Group', cadence: 'daily', call_duration_minutes: 30 });

      expect(res.status).toBe(201);
      expect(scheduler.scheduleInitialCallForGroup).toHaveBeenCalledTimes(1);
      expect(scheduler.scheduleInitialCallForGroup).toHaveBeenCalledWith(
        res.body.id, 'UTC', 6, 22,
      );
    });
  });

  describe('GET /groups', () => {
    it('returns empty list for a new user', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .get('/groups')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([]);
    });

    it('returns groups the user belongs to', async () => {
      const { token } = await createTestUserWithToken();
      await createGroup(token, { name: 'My Group' });

      const res = await request(app)
        .get('/groups')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.groups).toHaveLength(1);
      expect(res.body.groups[0].name).toBe('My Group');
    });

    it('does not return groups the user has not joined', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();

      await createGroup(ownerToken, { name: 'Private Group' });

      const res = await request(app)
        .get('/groups')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.groups).toHaveLength(0);
    });
  });

  describe('GET /groups/:id', () => {
    it('returns group details with members', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token, { name: 'Detail Group' });

      const res = await request(app)
        .get(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Detail Group');
      expect(res.body.members).toHaveLength(1);
      expect(res.body.member_count).toBe(1);
    });

    it('returns 404 for a non-existent group', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .get('/groups/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /groups/:id', () => {
    it('returns 404 — route removed in WS-9f (no ownership check, use PUT instead)', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token, { name: 'Old Name' });

      const res = await request(app)
        .patch(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /groups/:id', () => {
    it('allows a member to update the group name', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token, { name: 'Old Name' });

      const res = await request(app)
        .put(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('allows the owner to update cadence and duration', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token, { cadence: 'daily', duration: 5 });

      const res = await request(app)
        .put(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cadence: 'weekly', weekly_frequency: 3, call_duration_minutes: 15 });

      expect(res.status).toBe(200);
      expect(res.body.cadence).toBe('weekly');
    });

    it('returns 403 when a non-member tries to update', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .put(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when a non-owner tries to change owner-only fields', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      // Add member to group
      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .put(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ call_duration_minutes: 60 });

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent group', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .put('/groups/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ghost' });

      expect(res.status).toBe(403); // not a member, so 403 fires first
    });
  });

  describe('DELETE /groups/:id', () => {
    it('allows the owner to delete the group', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .delete(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });

    it('returns 403 when a non-owner tries to delete', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .delete(`/groups/${group.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent group', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .delete('/groups/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /groups/:id/mute', () => {
    it('mutes notifications for a member', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .put(`/groups/${group.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .send({ muted: true });

      expect(res.status).toBe(200);
      expect(res.body.is_muted).toBe(true);
    });

    it('unmutes notifications', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      await request(app)
        .put(`/groups/${group.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .send({ muted: true });

      const res = await request(app)
        .put(`/groups/${group.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .send({ muted: false });

      expect(res.status).toBe(200);
      expect(res.body.is_muted).toBe(false);
    });

    it('returns 400 when muted is not a boolean', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .put(`/groups/${group.id}/mute`)
        .set('Authorization', `Bearer ${token}`)
        .send({ muted: 'yes' });

      expect(res.status).toBe(400);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .put(`/groups/${group.id}/mute`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ muted: true });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /groups/:id/invite (invite code)', () => {
    it('creates an invite code for the group owner', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/invite`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.invite_code).toBeDefined();
      expect(res.body.expires_at).toBeDefined();
      expect(res.body.invite_link).toMatch(/orbit:\/\/invite\//);
    });

    it('returns 403 when a non-owner tries to create an invite', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/invite`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent group', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .post('/groups/00000000-0000-0000-0000-000000000000/invite')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /groups/:id/join', () => {
    it('allows a user to join via a valid invite code', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: joinerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const inviteRes = await request(app)
        .post(`/groups/${group.id}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`);
      const code = inviteRes.body.invite_code;

      const res = await request(app)
        .post(`/groups/${group.id}/join`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .send({ invite_code: code });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('joined');
    });

    it('returns already_member if user is already in the group', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const inviteRes = await request(app)
        .post(`/groups/${group.id}/invite`)
        .set('Authorization', `Bearer ${token}`);
      const code = inviteRes.body.invite_code;

      const res = await request(app)
        .post(`/groups/${group.id}/join`)
        .set('Authorization', `Bearer ${token}`)
        .send({ invite_code: code });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('already_member');
    });

    it('returns 400 when no invite code is provided', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: joinerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/join`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 for an invalid invite code', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: joinerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/join`)
        .set('Authorization', `Bearer ${joinerToken}`)
        .send({ invite_code: 'INVALID0' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /groups/:id/leave', () => {
    it('allows a member to leave a group', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/leave`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('left');
    });

    it('prevents the owner from leaving', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/leave`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/owner/i);
    });

    it('returns 404 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/leave`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /groups/:id/members/:memberId', () => {
    it('allows the owner to remove a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .delete(`/groups/${group.id}/members/${member.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 403 when a non-owner tries to remove a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const { user: target } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.createMany({
        data: [
          { group_id: group.id, user_id: member.id, role: 'member' },
          { group_id: group.id, user_id: target.id, role: 'member' },
        ],
      });

      const res = await request(app)
        .delete(`/groups/${group.id}/members/${target.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
    });

    it('prevents owner from removing themselves', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .delete(`/groups/${group.id}/members/${owner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 when member is not in the group', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: stranger } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .delete(`/groups/${group.id}/members/${stranger.id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /groups/:id/transfer-ownership', () => {
    it('transfers ownership to a group member', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: member } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ new_owner_id: member.id });

      expect(res.status).toBe(200);
      expect(res.body.group.owner_id).toBe(member.id);
    });

    it('returns 403 when a non-owner tries to transfer', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const { user: target } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.createMany({
        data: [
          { group_id: group.id, user_id: member.id, role: 'member' },
          { group_id: group.id, user_id: target.id, role: 'member' },
        ],
      });

      const res = await request(app)
        .post(`/groups/${group.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ new_owner_id: target.id });

      expect(res.status).toBe(403);
    });

    it('returns 400 when transferring to self', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ new_owner_id: owner.id });

      expect(res.status).toBe(400);
    });

    it('returns 400 when new owner is not a group member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: stranger } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ new_owner_id: stranger.id });

      expect(res.status).toBe(400);
    });

    it('returns 400 when new_owner_id is missing', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /groups/invites/:code/info', () => {
    it('returns group info for a valid invite code', async () => {
      const { token } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(token, { name: 'Invite Info Group' });

      const inviteRes = await request(app)
        .post(`/groups/${group.id}/invite`)
        .set('Authorization', `Bearer ${token}`);
      const code = inviteRes.body.invite_code;

      const res = await request(app)
        .get(`/groups/invites/${code}/info`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.group_id).toBe(group.id);
      expect(res.body.group_name).toBe('Invite Info Group');
      expect(res.body.code).toBe(code);
    });

    it('returns 404 for an unknown invite code', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .get('/groups/invites/ZZZZZZZZ/info')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /groups/:id/invite-user', () => {
    it('sends a direct invitation to a user by username', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: invitee } = await createTestUserWithToken({ username: 'invite_target' });
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invitee.username });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invited_user.id).toBe(invitee.id);
    });

    it('returns 400 when username is missing', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 404 when invited username does not exist', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'ghost_user_zzz' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when user is already a member', async () => {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: member } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: member.username });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('User is already a member of this group');
    });

    it('returns 400 when user already has a pending invitation', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: invitee } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invitee.username });

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invitee.username });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('User already has a pending invitation');
    });

    it('returns 403 when a non-owner tries to invite', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { user: member, token: memberToken } = await createTestUserWithToken();
      const { user: target } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      await prisma.groupMember.create({
        data: { group_id: group.id, user_id: member.id, role: 'member' },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ username: target.username });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /groups/invites/:id/respond', () => {
    async function setupInvite() {
      const { user: owner, token: ownerToken } = await createTestUserWithToken();
      const { user: invitee, token: inviteeToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const inviteRes = await request(app)
        .post(`/groups/${group.id}/invite-user`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ username: invitee.username });

      return { owner, ownerToken, invitee, inviteeToken, group, inviteId: inviteRes.body.invite_id };
    }

    it('accepts an invitation and adds the user to the group', async () => {
      const { inviteeToken, group, inviteId } = await setupInvite();

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('accepted');
      expect(res.body.group.id).toBe(group.id);

      // Confirm membership
      const groupRes = await request(app)
        .get('/groups')
        .set('Authorization', `Bearer ${inviteeToken}`);
      expect(groupRes.body.groups.some((g: any) => g.id === group.id)).toBe(true);
    });

    it('declines an invitation', async () => {
      const { inviteeToken, inviteId } = await setupInvite();

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'decline' });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('declined');
    });

    it('dismisses an invitation', async () => {
      const { inviteeToken, inviteId } = await setupInvite();

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'dismiss' });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('dismissed');
    });

    it('returns 400 for an invalid action', async () => {
      const { inviteeToken, inviteId } = await setupInvite();

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'ignore' });

      expect(res.status).toBe(400);
    });

    it('returns 403 when a different user tries to respond', async () => {
      const { inviteId } = await setupInvite();
      const { token: strangerToken } = await createTestUserWithToken();

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(403);
    });

    it('returns 400 when responding to an already-responded invitation', async () => {
      const { inviteeToken, inviteId } = await setupInvite();

      await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'decline' });

      const res = await request(app)
        .post(`/groups/invites/${inviteId}/respond`)
        .set('Authorization', `Bearer ${inviteeToken}`)
        .send({ action: 'accept' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already been responded/i);
    });
  });
});

// ─── Calls ────────────────────────────────────────────────────────────────────

describe('Calls endpoints', () => {
  describe('POST /groups/:id/call-now', () => {
    it('starts a spontaneous call for a group member', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/call-now`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(res.body.call_type).toBe('spontaneous');
      expect(res.body.room_name).toBeDefined();
    });

    it('returns 400 when a call is already active for the group', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      await request(app)
        .post(`/groups/${group.id}/call-now`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .post(`/groups/${group.id}/call-now`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already active/i);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/call-now`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /groups/:id/calls/current', () => {
    it('returns null when no call is active', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .get(`/groups/${group.id}/calls/current`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.current).toBeNull();
    });

    it('returns the active call with participants', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      await createActiveCall(group.id);

      const res = await request(app)
        .get(`/groups/${group.id}/calls/current`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.current).not.toBeNull();
      expect(res.body.current.status).toBe('active');
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .get(`/groups/${group.id}/calls/current`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /groups/:id/calls/history', () => {
    it('returns an empty list when no calls have ended', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .get(`/groups/${group.id}/calls/history`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.calls).toEqual([]);
    });

    it('returns ended calls in the history', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const startedAt = new Date(Date.now() - 600_000);
      await prisma.callSession.create({
        data: {
          group_id: group.id,
          status: 'ended',
          call_type: 'spontaneous',
          started_at: startedAt,
          ended_at: new Date(),
          room_name: `hist-room-${group.id}`,
        },
      });

      const res = await request(app)
        .get(`/groups/${group.id}/calls/history`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.calls).toHaveLength(1);
      expect(res.body.calls[0].status).toBe('ended');
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .get(`/groups/${group.id}/calls/history`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /groups/:id/calls/:callId/join-token', () => {
    it('returns a meeting token for an active call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/join-token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.room_name).toBe(call.room_name);
    });

    it('returns 404 when call does not exist', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/00000000-0000-0000-0000-000000000000/join-token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 when call is not active', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const endedCall = await prisma.callSession.create({
        data: {
          group_id: group.id,
          status: 'ended',
          call_type: 'spontaneous',
          started_at: new Date(Date.now() - 60_000),
          ended_at: new Date(),
          room_name: `ended-${group.id}`,
        },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${endedCall.id}/join-token`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Call is not active');
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);
      const call = await createActiveCall(group.id);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/join-token`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('seeds last_seen_at on the created participant row (A2 regression guard)', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/join-token`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const participant = await prisma.callParticipant.findFirst({
        where: { call_id: call.id, user_id: user.id },
      });
      expect(participant).not.toBeNull();
      expect(participant!.last_seen_at).not.toBeNull();
    });
  });

  describe('POST /groups/:id/calls/:callId/leave', () => {
    it('records a participant leaving a call', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      // Record join first
      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date() },
      });

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/leave`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('closes a spontaneous call when the last participant leaves', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date() },
      });

      await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/leave`)
        .set('Authorization', `Bearer ${token}`);

      const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
      expect(updated?.status).toBe('ended');
    });

    it('returns 200 even when user has no participant record', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/leave`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /groups/:id/calls/:callId/end', () => {
    it('ends an active call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/end`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await prisma.callSession.findUnique({ where: { id: call.id } });
      expect(updated?.status).toBe('ended');
    });

    it('is idempotent when the call is already ended', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/end`)
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/end`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);
      const call = await createActiveCall(group.id);

      const res = await request(app)
        .post(`/groups/${group.id}/calls/${call.id}/end`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /groups/:id/scheduled', () => {
    it('returns an empty list when no scheduled calls exist', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .get(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.calls).toEqual([]);
    });

    it('returns scheduled calls for the group', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const scheduledAt = new Date(Date.now() + 3_600_000);

      await createScheduledCallRecord(group.id, scheduledAt);

      const res = await request(app)
        .get(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.calls).toHaveLength(1);
      expect(res.body.calls[0].status).toBe('scheduled');
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .get(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /groups/:id/scheduled', () => {
    it('creates a scheduled call for a future time', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();

      const res = await request(app)
        .post(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: scheduledAt });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('scheduled');
      expect(res.body.call_type).toBe('scheduled');
      expect(res.body.scheduled_at).toBeDefined();
    });

    it('returns 400 when scheduled_at is missing', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when scheduled_at is not a valid date', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .post(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: 'not-a-date' });

      expect(res.status).toBe(400);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);

      const res = await request(app)
        .post(`/groups/${group.id}/scheduled`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ scheduled_at: new Date(Date.now() + 3_600_000).toISOString() });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /groups/:groupId/scheduled/:callId', () => {
    it('updates the scheduled time of a pending call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const scheduledAt = new Date(Date.now() + 3_600_000);
      const call = await createScheduledCallRecord(group.id, scheduledAt);
      const newTime = new Date(Date.now() + 7_200_000).toISOString();

      const res = await request(app)
        .patch(`/groups/${group.id}/scheduled/${call.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: newTime });

      expect(res.status).toBe(200);
      expect(res.body.scheduled_at).toBe(newTime);
    });

    it('returns 400 when scheduled_at is missing', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createScheduledCallRecord(group.id, new Date(Date.now() + 3_600_000));

      const res = await request(app)
        .patch(`/groups/${group.id}/scheduled/${call.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when trying to modify an active call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);

      // Force call_type to scheduled for this test
      const scheduled = await prisma.callSession.create({
        data: {
          group_id: group.id,
          status: 'active', // active, not scheduled
          call_type: 'scheduled',
          scheduled_at: new Date(),
          ends_at: new Date(Date.now() + 300_000),
          room_name: `active-sched-${group.id}`,
        },
      });

      const res = await request(app)
        .patch(`/groups/${group.id}/scheduled/${scheduled.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduled_at: new Date(Date.now() + 3_600_000).toISOString() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status "scheduled"/);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);
      const call = await createScheduledCallRecord(group.id, new Date(Date.now() + 3_600_000));

      const res = await request(app)
        .patch(`/groups/${group.id}/scheduled/${call.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ scheduled_at: new Date(Date.now() + 7_200_000).toISOString() });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /groups/:groupId/scheduled/:callId', () => {
    it('deletes a scheduled call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createScheduledCallRecord(group.id, new Date(Date.now() + 3_600_000));

      const res = await request(app)
        .delete(`/groups/${group.id}/scheduled/${call.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const found = await prisma.callSession.findUnique({ where: { id: call.id } });
      expect(found).toBeNull();
    });

    it('returns 400 when trying to delete an active scheduled call', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const activeScheduled = await prisma.callSession.create({
        data: {
          group_id: group.id,
          status: 'active',
          call_type: 'scheduled',
          scheduled_at: new Date(),
          ends_at: new Date(Date.now() + 300_000),
          room_name: `active-del-${group.id}`,
        },
      });

      const res = await request(app)
        .delete(`/groups/${group.id}/scheduled/${activeScheduled.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('returns 404 when call does not exist', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app)
        .delete(`/groups/${group.id}/scheduled/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 when user is not a member', async () => {
      const { token: ownerToken } = await createTestUserWithToken();
      const { token: otherToken } = await createTestUserWithToken();
      const group = await createGroup(ownerToken);
      const call = await createScheduledCallRecord(group.id, new Date(Date.now() + 3_600_000));

      const res = await request(app)
        .delete(`/groups/${group.id}/scheduled/${call.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });
  });
});

// ─── Svc ──────────────────────────────────────────────────────────────────────

describe('Svc endpoints', () => {
  describe('POST /svc/schedule/rollover', () => {
    it('returns ok', async () => {
      const res = await request(app).post('/svc/schedule/rollover');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /svc/schedule/trigger', () => {
    it('returns triggered', async () => {
      const res = await request(app).post('/svc/schedule/trigger');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('triggered');
    });
  });

  describe('POST /svc/calls/:id/close', () => {
    it('returns the call id and closed status', async () => {
      const fakeId = 'test-call-id-123';
      const res = await request(app).post(`/svc/calls/${fakeId}/close`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fakeId);
      expect(res.body.status).toBe('closed');
    });
  });

  describe('POST /svc/daily/webhook', () => {
    it('marks participant as left on participant-left event', async () => {
      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);
      const participant = await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date() },
      });

      const res = await request(app)
        .post('/svc/daily/webhook')
        .send({ type: 'participant-left', properties: { room_name: call.room_name, user_id: user.id } });

      expect(res.status).toBe(200);
      // Webhook responds immediately and processes async — wait for DB write.
      await new Promise(r => setTimeout(r, 100));
      const updated = await prisma.callParticipant.findUnique({ where: { id: participant.id } });
      expect(updated?.left_at).not.toBeNull();
    });

    it('presence guard: does not close call when Daily still reports connected participants', async () => {
      const { dailyVideo: mockDaily } = jest.requireMock('../services/dailyVideo');
      const { scheduler: mockScheduler } = jest.requireMock('../services/scheduler');
      mockDaily.getRoomPresenceCount.mockResolvedValueOnce(1);
      mockScheduler.closeCall.mockClear();

      const { user, token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const call = await createActiveCall(group.id);
      await prisma.callParticipant.create({
        data: { call_id: call.id, user_id: user.id, joined_at: new Date() },
      });

      await request(app)
        .post('/svc/daily/webhook')
        .send({ type: 'participant-left', properties: { room_name: call.room_name, user_id: user.id } });

      const still = await prisma.callSession.findUnique({ where: { id: call.id } });
      expect(still?.status).toBe('active');
      expect(mockScheduler.closeCall).not.toHaveBeenCalled();
    });
  });

  describe('GET /svc/groups/:groupId/upcoming', () => {
    it('returns upcoming scheduled calls for a group', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      const scheduledAt = new Date(Date.now() + 3_600_000);
      await createScheduledCallRecord(group.id, scheduledAt);

      const res = await request(app).get(`/svc/groups/${group.id}/upcoming`);

      expect(res.status).toBe(200);
      expect(res.body.group_id).toBe(group.id);
      expect(res.body.upcoming_count).toBe(1);
      expect(res.body.calls).toHaveLength(1);
    });

    it('returns 0 upcoming calls when none are scheduled', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);

      const res = await request(app).get(`/svc/groups/${group.id}/upcoming`);

      expect(res.status).toBe(200);
      expect(res.body.upcoming_count).toBe(0);
      expect(res.body.calls).toEqual([]);
    });

    it('does not return past scheduled calls as upcoming', async () => {
      const { token } = await createTestUserWithToken();
      const group = await createGroup(token);
      // Past call
      await createScheduledCallRecord(group.id, new Date(Date.now() - 3_600_000));

      const res = await request(app).get(`/svc/groups/${group.id}/upcoming`);

      expect(res.status).toBe(200);
      expect(res.body.upcoming_count).toBe(0);
    });

    it('returns 404 for a non-existent group', async () => {
      const res = await request(app).get('/svc/groups/00000000-0000-0000-0000-000000000000/upcoming');
      expect(res.status).toBe(404);
    });
  });
});

describe('Error handling', () => {
  it('returns 413, not 500, for a body over the express.json limit', async () => {
    const { token } = await createTestUserWithToken();
    const res = await request(app)
      .put('/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: 'A'.repeat(5 * 1024 * 1024), mime_type: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('payload_too_large');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
