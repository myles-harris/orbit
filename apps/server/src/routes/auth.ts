import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { issueAccessAndRefreshTokens } from '../services/jwt.js';
import { twilioVerify } from '../services/twilioVerify.js';
import { prisma } from '../db/prisma.js';

export const authRouter = Router();

const requestOtpSchema = z.object({ phone: z.string(), username: z.string().optional() });
authRouter.post('/request-otp', async (req, res) => {
  const parsed = requestOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const { phone } = parsed.data;
  await twilioVerify.requestOtp(phone);
  res.json({ status: 'sent' });
});

const verifyOtpSchema = z.object({ phone: z.string(), code: z.string(), username: z.string().optional() });
authRouter.post('/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const { phone, code, username } = parsed.data;
  const verified = await twilioVerify.verifyOtp(phone, code);
  if (!verified) return res.status(401).json({ error: 'invalid_code' });

  const created = await prisma.user.upsert({
    where: { phone },
    update: { username: username ?? undefined },
    create: { phone, username: username ?? `user_${phone.slice(-4)}`, time_zone: 'UTC' },
  });

  const tokens = issueAccessAndRefreshTokens({ userId: created.id });
  res.json({ user: { id: created.id, phone: created.phone, username: created.username, time_zone: created.time_zone, created_at: created.created_at }, ...tokens });
});

const refreshSchema = z.object({ refresh_token: z.string() });
authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });

  const { refresh_token } = parsed.data;

  try {
    const decoded = jwt.verify(
      refresh_token,
      process.env.REFRESH_TOKEN_SECRET || 'dev_refresh'
    ) as jwt.JwtPayload;

    if (decoded.type !== 'refresh' || !decoded.sub) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ error: 'user_not_found' });

    const tokens = issueAccessAndRefreshTokens({ userId: user.id });
    res.json(tokens);
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
});

