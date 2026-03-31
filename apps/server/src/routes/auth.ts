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

const verifyOtpSchema = z.object({ phone: z.string(), code: z.string() });
authRouter.post('/verify-otp', async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const { phone, code } = parsed.data;
  const verified = await twilioVerify.verifyOtp(phone, code);
  if (!verified) return res.status(401).json({ error: 'invalid_code' });

  const existing = await prisma.user.findUnique({ where: { phone } });

  if (!existing) {
    // New user — issue a short-lived signup token; account created after username is chosen
    const signup_token = jwt.sign({ type: 'signup', phone }, process.env.JWT_SECRET || 'dev', { expiresIn: 600 });
    return res.json({ is_new_user: true, signup_token });
  }

  const tokens = issueAccessAndRefreshTokens({ userId: existing.id });
  res.json({ user: { id: existing.id, phone: existing.phone, username: existing.username, time_zone: existing.time_zone, created_at: existing.created_at }, is_new_user: false, ...tokens });
});

const completeSignupSchema = z.object({ signup_token: z.string(), username: z.string().min(1) });
authRouter.post('/complete-signup', async (req, res) => {
  const parsed = completeSignupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const { signup_token, username } = parsed.data;

  let phone: string;
  try {
    const decoded = jwt.verify(signup_token, process.env.JWT_SECRET || 'dev') as jwt.JwtPayload;
    if (decoded.type !== 'signup' || !decoded.phone) return res.status(401).json({ error: 'invalid_token' });
    phone = decoded.phone;
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'username_taken' });

  const user = await prisma.user.create({ data: { phone, username, time_zone: 'UTC' } });
  const tokens = issueAccessAndRefreshTokens({ userId: user.id });
  res.json({ user: { id: user.id, phone: user.phone, username: user.username, time_zone: user.time_zone, created_at: user.created_at }, ...tokens });
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

