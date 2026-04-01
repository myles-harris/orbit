/**
 * Test helpers for creating users and JWT tokens without going through the auth flow.
 * This bypasses Twilio so tests don't make real API calls.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'dev';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev_refresh';

export async function createTestUser(overrides: { phone?: string; username?: string } = {}) {
  const phone = overrides.phone ?? `+1555${Math.floor(Math.random() * 9_000_000) + 1_000_000}`;
  const username = overrides.username ?? `testuser_${Math.random().toString(36).substring(2, 8)}`;
  return prisma.user.create({
    data: { phone, username, time_zone: 'UTC' },
  });
}

export function createAccessToken(userId: string): string {
  return jwt.sign({}, JWT_SECRET, { subject: userId, expiresIn: 900 });
}

export function createRefreshToken(userId: string): string {
  return jwt.sign({ type: 'refresh' }, REFRESH_SECRET, { subject: userId, expiresIn: 3600 });
}

export async function createTestUserWithToken(overrides: { phone?: string; username?: string } = {}) {
  const user = await createTestUser(overrides);
  const token = createAccessToken(user.id);
  return { user, token };
}
