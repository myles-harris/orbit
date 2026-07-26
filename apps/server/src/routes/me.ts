import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';
import { dailyVideo } from '../services/dailyVideo.js';

export const meRouter = Router();

meRouter.get('/', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: user.id, phone: user.phone, username: user.username,
      time_zone: user.time_zone, created_at: user.created_at,
      has_avatar: user.avatar !== null,
      avatar_updated_at: user.avatar_updated_at?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[GET /me] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

const patchSchema = z.object({
  username: z.string().min(1).optional(),
  time_zone: z.string().refine(tz => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
  }, { message: 'invalid_timezone' }).optional(),
});
meRouter.patch('/', requireJwt, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.update({ where: { id: userId }, data: parsed.data });
    res.json({
      id: user.id, phone: user.phone, username: user.username,
      time_zone: user.time_zone, created_at: user.created_at,
      has_avatar: user.avatar !== null,
      avatar_updated_at: user.avatar_updated_at?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[PATCH /me] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

const AVATAR_MAX_BYTES = 200 * 1024; // 200 KB

// Magic bytes for accepted image types
const MAGIC_BYTES: Array<{ mime: string; check: (b: Buffer) => boolean }> = [
  { mime: 'image/jpeg', check: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png',  check: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', check: b => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { mime: 'image/gif',  check: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
];

const avatarUploadSchema = z.object({
  data: z.string().min(1),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
});
meRouter.put('/avatar', requireJwt, async (req, res) => {
  const parsed = avatarUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    const buf = Buffer.from(parsed.data.data, 'base64');
    if (buf.length > AVATAR_MAX_BYTES) return res.status(400).json({ error: 'avatar_too_large' });
    const magic = MAGIC_BYTES.find(m => m.mime === parsed.data.mime_type);
    if (!magic || buf.length < 12 || !magic.check(buf)) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: buf, avatar_mime_type: parsed.data.mime_type, avatar_updated_at: now },
    });
    res.json({ ok: true, avatar_updated_at: now.toISOString() });
  } catch (error) {
    console.error('[PUT /me/avatar] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

meRouter.delete('/avatar', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    await prisma.user.update({ where: { id: userId }, data: { avatar: null, avatar_mime_type: null, avatar_updated_at: null } });
    res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /me/avatar] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

const deviceSchema = z.object({ token: z.string(), platform: z.enum(['ios', 'android']) });
meRouter.post('/devices/register-push', requireJwt, async (req, res) => {
  const parsed = deviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    await prisma.pushDevice.upsert({
      where: { token: parsed.data.token },
      update: { user_id: userId, platform: parsed.data.platform },
      create: { token: parsed.data.token, user_id: userId, platform: parsed.data.platform },
    });
    res.json({ status: 'registered' });
  } catch (error) {
    console.error('[POST /me/devices/register-push] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

meRouter.delete('/devices/register-push', requireJwt, async (req, res) => {
  try {
    const token = (req.query.token as string) || '';
    if (token) await prisma.pushDevice.deleteMany({ where: { token } });
    res.json({ status: 'unregistered' });
  } catch (error) {
    console.error('[DELETE /me/devices/register-push] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

/**
 * Called on app startup to immediately vacate any calls the user was in
 * during a previous session that ended without an explicit leave (e.g. force-quit).
 *
 * Only touches rows old enough to belong to a previous session — a 60s grace period
 * prevents this from vacating a fresh join-token row created after a cold-start tap
 * on a call notification (where this request can race with the join).
 */
meRouter.post('/calls/leave', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;

    const GRACE_MS = 60 * 1000;
    const activeParticipations = await prisma.callParticipant.findMany({
      where: {
        user_id: userId,
        left_at: null,
        joined_at: { lt: new Date(Date.now() - GRACE_MS) },
      },
      include: { call: true },
    });

    console.log(`[POST /me/calls/leave] user=${userId} found ${activeParticipations.length} open participation(s)`);

    for (const participant of activeParticipations) {
      await prisma.callParticipant.update({
        where: { id: participant.id },
        data: { left_at: new Date() },
      });

      console.log(`[POST /me/calls/leave] marked participant ${participant.id} as left (call=${participant.call_id}, type=${participant.call.call_type}, status=${participant.call.status})`);

      if (participant.call.status === 'active' && participant.call.call_type === 'spontaneous') {
        const remaining = await prisma.callParticipant.count({
          where: { call_id: participant.call_id, left_at: null },
        });
        console.log(`[POST /me/calls/leave] call ${participant.call_id} has ${remaining} remaining participant(s)`);
        if (remaining === 0) {
          const presence = participant.call.room_name
            ? await dailyVideo.getRoomPresenceCount(participant.call.room_name)
            : null;

          if (presence !== null && presence > 0) {
            console.warn(
              `[POST /me/calls/leave] Call ${participant.call_id} empty in DB but Daily reports ` +
              `${presence} connected — skipping close`
            );
            continue;
          }

          await scheduler.closeCall(participant.call_id);
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[POST /me/calls/leave] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
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

