import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';
import { dailyVideo } from '../services/dailyVideo.js';

export const meRouter = Router();

// Every scalar the client needs — deliberately excludes `avatar`, which is a
// multi-megabyte BYTEA. `has_avatar` derives from `avatar_updated_at`; the two
// columns are written together at every call site and the invariant is enforced
// by the `user_avatar_consistency` CHECK constraint.
const USER_PUBLIC_SELECT = {
  id: true,
  phone: true,
  username: true,
  time_zone: true,
  avatar_updated_at: true,
  notify_sound: true,
  notify_vibrate: true,
  notify_break_focus: true,
  created_at: true,
} satisfies Prisma.UserSelect;

type PublicUser = {
  id: string;
  phone: string;
  username: string;
  time_zone: string;
  avatar_updated_at: Date | null;
  notify_sound: boolean;
  notify_vibrate: boolean;
  notify_break_focus: boolean;
  created_at: Date;
};

function serializeUser(user: PublicUser) {
  return {
    id: user.id,
    phone: user.phone,
    username: user.username,
    time_zone: user.time_zone,
    has_avatar: user.avatar_updated_at !== null,
    avatar_updated_at: user.avatar_updated_at?.toISOString() ?? null,
    notify_sound: user.notify_sound,
    notify_vibrate: user.notify_vibrate,
    notify_break_focus: user.notify_break_focus,
    created_at: user.created_at,
  };
}

meRouter.get('/', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_PUBLIC_SELECT });
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json(serializeUser(user));
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
  notify_sound: z.boolean().optional(),
  notify_vibrate: z.boolean().optional(),
  notify_break_focus: z.boolean().optional(),
});

meRouter.patch('/', requireJwt, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    const user = await prisma.user.update({ where: { id: userId }, data: parsed.data, select: USER_PUBLIC_SELECT });
    res.json(serializeUser(user));
  } catch (error) {
    console.error('[PATCH /me] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — keep in sync with the boundary tests in api.test.ts

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
      select: { id: true },
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
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatar_mime_type: null, avatar_updated_at: null },
      select: { id: true },
    });
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

const liveActivitySchema = z.object({
  device_token: z.string().min(1),
  pts_token: z.string().min(1),
});

meRouter.post('/devices/register-live-activity', requireJwt, async (req, res) => {
  const parsed = liveActivitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    // Scope the update by user_id so users cannot overwrite each other's tokens.
    const result = await prisma.pushDevice.updateMany({
      where: { token: parsed.data.device_token, user_id: userId },
      data: { live_activity_pts_token: parsed.data.pts_token, pts_updated_at: new Date() },
    });

    if (result.count === 0) {
      console.warn(`[POST /me/devices/register-live-activity] No device row for user ${userId}, PTS token dropped`);
      return res.status(404).json({ error: 'device_not_registered' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[POST /me/devices/register-live-activity] Error:', error);
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
 * Active calls across all of the user's groups. The client uses this to reconcile
 * iOS Live Activities on launch: any activity whose callId is absent here is
 * orphaned (crash, force-quit) and safe to end.
 */
meRouter.get('/calls/active', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const calls = await prisma.callSession.findMany({
      where: {
        status: 'active',
        group: { members: { some: { user_id: userId } } },
      },
      select: { id: true },
    });
    res.json({ callIds: calls.map((c) => c.id) });
  } catch (error) {
    console.error('[GET /me/calls/active] Error:', error);
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

