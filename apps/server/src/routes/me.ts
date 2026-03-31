import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';

export const meRouter = Router();

meRouter.get('/', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ id: user.id, phone: user.phone, username: user.username, time_zone: user.time_zone, created_at: user.created_at });
});

const patchSchema = z.object({ username: z.string().min(1).optional(), time_zone: z.string().optional() });
meRouter.patch('/', requireJwt, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const userId = (req as any).userId as string;
  const user = await prisma.user.update({ where: { id: userId }, data: parsed.data });
  res.json({ id: user.id, phone: user.phone, username: user.username, time_zone: user.time_zone, created_at: user.created_at });
});

const deviceSchema = z.object({ token: z.string(), platform: z.enum(['ios', 'android']) });
meRouter.post('/devices/register-push', requireJwt, async (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const userId = (req as any).userId as string;
  await prisma.pushDevice.upsert({
    where: { token: parsed.data.token },
    update: { user_id: userId, platform: parsed.data.platform },
    create: { token: parsed.data.token, user_id: userId, platform: parsed.data.platform },
  });
  res.json({ status: 'registered' });
});

meRouter.delete('/devices/register-push', requireJwt, async (req, res) => {
  const token = (req.query.token as string) || '';
  if (token) await prisma.pushDevice.deleteMany({ where: { token } });
  res.json({ status: 'unregistered' });
});

/**
 * Get all pending invitations for the current user
 */
meRouter.get('/invitations', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;

    const invitations = await prisma.invite.findMany({
      where: {
        invited_user_id: userId,
        status: 'pending',
        expires_at: {
          gt: new Date()
        }
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            cadence: true,
            weekly_frequency: true,
            call_duration_minutes: true,
            members: {
              select: {
                user: {
                  select: {
                    username: true
                  }
                }
              }
            }
          }
        },
        creator: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json({
      invitations: invitations.map(invite => ({
        id: invite.id,
        group: {
          id: invite.group.id,
          name: invite.group.name,
          cadence: invite.group.cadence,
          weekly_frequency: invite.group.weekly_frequency,
          call_duration_minutes: invite.group.call_duration_minutes,
          member_count: invite.group.members.length
        },
        invited_by: invite.creator.username,
        created_at: invite.created_at.toISOString(),
        expires_at: invite.expires_at.toISOString()
      }))
    });
  } catch (error) {
    console.error('[get-invitations] Error:', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

