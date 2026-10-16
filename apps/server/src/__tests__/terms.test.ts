// ─── Mocks (hoisted before imports) ─────────────────────────────────────────
// Copied from api.test.ts:10-50 so no real Twilio / Daily.co / push calls are made.

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

// ─── Imports ─────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../app.js';
import { createTestUserWithToken } from './helpers/auth.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'dev';

function signupToken(phone: string, expiresIn: number = 600) {
  return jwt.sign({ type: 'signup', phone }, JWT_SECRET, { expiresIn });
}

describe('POST /auth/complete-signup — accept_terms', () => {
  it('stores the version and a timestamp, and GET /me returns it', async () => {
    const phone = '+15557000001';
    const res = await request(app)
      .post('/auth/complete-signup')
      .send({
        signup_token: signupToken(phone),
        username: 'termsuser1',
        accept_terms: { version: 1, age_confirmed: true },
      });

    expect(res.status).toBe(200);
    const token = res.body.access_token as string;

    const me = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.accepted_terms_version).toBe(1);

    const stored = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(stored.accepted_terms_version).toBe(1);
    expect(stored.accepted_terms_at).not.toBeNull();
  });

  it('without accept_terms, succeeds and stores null for both columns', async () => {
    const phone = '+15557000002';
    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: signupToken(phone), username: 'termsuser2' });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(stored.accepted_terms_version).toBeNull();
    expect(stored.accepted_terms_at).toBeNull();
  });

  it.each([
    ['age_confirmed: false', { version: 1, age_confirmed: false }],
    ['version: 0', { version: 0, age_confirmed: true }],
    ['version: 1.5', { version: 1.5, age_confirmed: true }],
  ])('returns 400 for %s', async (_label, accept_terms) => {
    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: signupToken('+15557000003'), username: 'termsbad', accept_terms });

    expect(res.status).toBe(400);
  });
});

describe('POST /me/accept-terms', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/me/accept-terms')
      .send({ version: 1, age_confirmed: true });

    expect(res.status).toBe(401);
  });

  it('returns 400 for a bad body', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .post('/me/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, age_confirmed: false });

    expect(res.status).toBe(400);
  });

  it('returns 200 and sets accepted_terms_version and accepted_terms_at for a good body', async () => {
    const { user, token } = await createTestUserWithToken();

    const res = await request(app)
      .post('/me/accept-terms')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, age_confirmed: true });

    expect(res.status).toBe(200);
    expect(res.body.accepted_terms_version).toBe(1);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.accepted_terms_version).toBe(1);
    expect(stored.accepted_terms_at).not.toBeNull();
  });
});

describe('PATCH /me — accepted_terms_version is not client-writable', () => {
  it('leaves the stored value unchanged', async () => {
    const { user, token } = await createTestUserWithToken();

    const res = await request(app)
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ accepted_terms_version: 9 });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.accepted_terms_version).toBeNull();
  });
});

describe('user_terms_consistency CHECK constraint', () => {
  it('rejects a version written without a timestamp', async () => {
    const { user } = await createTestUserWithToken();

    await expect(
      prisma.user.update({ where: { id: user.id }, data: { accepted_terms_version: 5 } })
    ).rejects.toThrow();
  });
});
