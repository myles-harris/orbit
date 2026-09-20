import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';
import { dailyVideo } from '../services/dailyVideo.js';
import { broadcastCallPresence, sendPresenceToToken } from '../services/callPresence.js';
import { imageUploadSchema, decodeImageUpload } from '../util/imageUpload.js';

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

meRouter.put('/avatar', requireJwt, async (req, res) => {
  const parsed = imageUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    const image = decodeImageUpload(parsed.data);
    if (!image.ok) {
      return res.status(400).json({ error: image.reason === 'too_large' ? 'avatar_too_large' : 'invalid_image' });
    }
    const now = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: image.buf, avatar_mime_type: parsed.data.mime_type, avatar_updated_at: now },
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

const activityTokenSchema = z.object({
  call_id: z.string().uuid(),
  push_token: z.string().min(1),
});

/**
 * Per-activity Live Activity push token. Distinct from the push-to-start token on
 * PushDevice: this one addresses ONE running activity and is what update/end pushes
 * target.
 */
meRouter.post('/calls/live-activity-token', requireJwt, async (req, res) => {
  const parsed = activityTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;
    const { call_id, push_token } = parsed.data;

    const call = await prisma.callSession.findUnique({
      where: { id: call_id },
      select: { group_id: true, status: true },
    });
    if (!call) return res.status(404).json({ error: 'call_not_found' });
    if (call.status !== 'active') return res.status(409).json({ error: 'call_not_active' });

    // Authorization: caller must be a member of the group that owns this call, not
    // necessarily a CallParticipant. Every non-muted group member gets a Live Activity
    // whether or not they've joined (see scheduler.ts's startLiveActivities call, which
    // targets all members' push-to-start tokens, not participants') — the surface exists
    // to tell people a call is happening. Narrowing this to CallParticipant would break
    // that for anyone who hasn't opened the call yet.
    const membership = await prisma.groupMember.findFirst({
      where: { group_id: call.group_id, user_id: userId },
      select: { id: true },
    });
    if (!membership) return res.status(403).json({ error: 'not_a_member' });

    // Ownership is never reassigned. The unique key is (call_id, push_token), so without
    // this check any group member who learns another member's activity token could POST
    // it and take over the row. user_id is load-bearing at stage 8: it drives the mute
    // filter on fan-out.
    const existing = await prisma.callLiveActivityToken.findUnique({
      where: { call_id_push_token: { call_id, push_token } },
      select: { user_id: true },
    });
    if (existing && existing.user_id !== userId) {
      console.warn(`[presence] Activity token reassignment refused for call ${call_id}`);
      return res.status(409).json({ error: 'token_owned_by_another_user' });
    }

    await prisma.callLiveActivityToken.upsert({
      where: { call_id_push_token: { call_id, push_token } },
      create: { call_id, user_id: userId, push_token },
      update: {},
    });

    res.json({ ok: true });

    // [fix 3] Seed this activity with the current count. Broadcasts only fire on a
    // count CHANGE, so a token that registers mid-call would otherwise render whatever
    // push-to-start seeded, forever, on a call where the count never changes again.
    // This is the normal path if stage 0's spike 2 came back negative.
    // (call.status is already guaranteed 'active' by the check at line 211 above —
    // sendPresenceToToken re-checks it fresh itself, so no re-check is needed here.)
    void sendPresenceToToken(call_id, push_token).catch(err =>
      console.error(`[presence] Targeted seed failed for call ${call_id}:`, err));
  } catch (error) {
    console.error('[POST /me/calls/live-activity-token] Error:', error);
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
      broadcastCallPresence(participant.call_id);

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
 * Active calls across all of the user's groups. Two consumers:
 *
 *  - Home's live card reads `calls`. Only a scheduled call has a fixed `ends_at`; a
 *    spontaneous call runs until its last participant leaves, so its `ends_at` is
 *    `null` (never absent, never ''), and the client branches on `call_type`.
 *  - The client reconciles iOS Live Activities on launch from `callIds`: any activity
 *    whose callId is absent here is orphaned (crash, force-quit) and safe to end.
 *
 * `callIds` is the shape this endpoint had before `calls` existed. TestFlight builds
 * that predate it still read it, so both are returned for one release; drop `callIds`
 * once those builds have aged out.
 */
meRouter.get('/calls/active', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const calls = await prisma.callSession.findMany({
      where: {
        status: 'active',
        group: { members: { some: { user_id: userId } } },
      },
      select: {
        id: true,
        group_id: true,
        call_type: true,
        started_at: true,
        ends_at: true,
        // Who is in the call right now, as on GET /groups/:id/calls/current.
        _count: { select: { participants: { where: { left_at: null } } } },
      },
    });
    res.json({
      callIds: calls.map((c) => c.id),
      // Every path that sets status 'active' also sets started_at (scheduler activation,
      // call-now), so the column being nullable never drops a row here in practice. The
      // guard is for the type: `calls` promises a string, and callIds above still lists
      // the call either way.
      calls: calls.flatMap((c) => c.started_at ? [{
        id: c.id,
        group_id: c.group_id,
        call_type: c.call_type,
        started_at: c.started_at.toISOString(),
        ends_at: c.ends_at?.toISOString() ?? null,
        participant_count: c._count.participants,
      }] : []),
    });
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

