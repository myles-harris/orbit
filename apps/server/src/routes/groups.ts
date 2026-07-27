import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';
import { notifications } from '../services/notifications.js';
import { scheduler } from '../services/scheduler.js';
import { calendarDateInTz, addDays, dayBoundsUtc } from '../util/scheduleTime.js';

export const groupsRouter = Router();

const validTz = (tz: string) => {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
};

const createSchema = z.object({
  name: z.string(),
  cadence: z.enum(['daily', 'weekly']),
  // WS-6: daily groups are always 1x/day; accept any int from old clients but ignore it
  daily_frequency: z.number().int().optional(),
  weekly_frequency: z.number().int().min(1).max(6).optional(),
  call_duration_minutes: z.number().int().min(2).max(120),
  call_window_start: z.number().int().min(0).max(23).optional(),
  call_window_end: z.number().int().min(1).max(23).optional(),
  time_zone: z.string().refine(validTz, { message: 'invalid_timezone' }).optional(),
});

groupsRouter.post('/', requireJwt, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  try {
    const userId = (req as any).userId as string;

    // Resolve group timezone: client-provided > owner's profile tz > UTC
    let groupTz = parsed.data.time_zone;
    if (!groupTz) {
      const owner = await prisma.user.findUnique({ where: { id: userId }, select: { time_zone: true } });
      groupTz = owner?.time_zone || 'UTC';
    }

    const group = await prisma.group.create({
      data: {
        name: parsed.data.name,
        owner_id: userId,
        cadence: parsed.data.cadence as any,
        daily_frequency: parsed.data.cadence === 'daily' ? 1 : null,
        weekly_frequency: parsed.data.cadence === 'weekly' ? (parsed.data.weekly_frequency ?? 1) : null,
        call_duration_minutes: parsed.data.call_duration_minutes,
        call_window_start: parsed.data.call_window_start ?? 6,
        call_window_end: parsed.data.call_window_end ?? 22,
        time_zone: groupTz,
        members: { create: { user_id: userId, role: 'owner' } },
      },
      include: { members: true },
    });

    // WS-8: schedule first call for today if the window is still open
    try {
      await scheduler.scheduleInitialCallForGroup(
        group.id,
        group.time_zone,
        group.call_window_start,
        group.call_window_end,
      );
    } catch (err) {
      console.error('[POST /groups] scheduleInitialCallForGroup failed (non-fatal):', err);
    }

    res.status(201).json({
      id: group.id,
      name: group.name,
      owner_id: group.owner_id,
      cadence: group.cadence,
      daily_frequency: group.daily_frequency,
      weekly_frequency: group.weekly_frequency,
      call_duration_minutes: group.call_duration_minutes,
      call_window_start: group.call_window_start,
      call_window_end: group.call_window_end,
      time_zone: group.time_zone,
      member_count: group.members.length,
      members: group.members.map((m: any) => ({ user_id: m.user_id, role: m.role })),
      created_at: group.created_at,
    });
  } catch (error) {
    console.error('[POST /groups] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

groupsRouter.get('/', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const memberships = await prisma.groupMember.findMany({ where: { user_id: userId }, include: { group: { include: { members: true } } } });
    const groups = memberships.map((m: any) => ({
      id: m.group.id,
      name: m.group.name,
      owner_id: m.group.owner_id,
      cadence: m.group.cadence,
      daily_frequency: m.group.daily_frequency,
      weekly_frequency: m.group.weekly_frequency,
      call_duration_minutes: m.group.call_duration_minutes,
      call_window_start: m.group.call_window_start,
      call_window_end: m.group.call_window_end,
      time_zone: m.group.time_zone,
      is_muted: m.is_muted,
      member_count: m.group.members.length,
      members: m.group.members.map((mm: any) => ({ user_id: mm.user_id, role: mm.role })),
      created_at: m.group.created_at,
    }));
    res.json({ groups });
  } catch (error) {
    console.error('[GET /groups] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

groupsRouter.get('/:id', requireJwt, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const grp = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, username: true, avatar: true, avatar_updated_at: true } } } },
        calls: { orderBy: { started_at: 'desc' }, take: 1 },
      },
    });
    if (!grp) return res.status(404).json({ error: 'not_found' });
    const myMembership = grp.members.find((m: any) => m.user_id === userId);
    res.json({
      id: grp.id,
      name: grp.name,
      owner_id: grp.owner_id,
      cadence: grp.cadence,
      daily_frequency: grp.daily_frequency,
      weekly_frequency: grp.weekly_frequency,
      call_duration_minutes: grp.call_duration_minutes,
      call_window_start: grp.call_window_start,
      call_window_end: grp.call_window_end,
      time_zone: grp.time_zone,
      is_muted: myMembership?.is_muted ?? false,
      member_count: grp.members.length,
      members: grp.members.map((m: any) => ({
        user_id: m.user_id,
        username: m.user.username,
        has_avatar: m.user.avatar !== null,
        avatar_updated_at: m.user.avatar_updated_at?.toISOString() ?? null,
        role: m.user_id === grp.owner_id ? 'owner' : 'member',
      })),
      last_call: grp.calls[0] ? { id: grp.calls[0].id, ended_at: grp.calls[0].ended_at?.toISOString?.() ?? '' } : null,
      created_at: grp.created_at,
    });
  } catch (error) {
    console.error('[GET /groups/:id] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

const patchSchema = z.object({
  name: z.string().optional(),
  cadence: z.enum(['daily', 'weekly']).optional(),
  // WS-6: accept any int for backwards compat, but the handler always writes 1
  daily_frequency: z.number().int().optional(),
  weekly_frequency: z.number().int().min(1).max(6).optional(),
  call_duration_minutes: z.number().int().min(2).max(120).optional(),
  call_window_start: z.number().int().min(0).max(23).optional(),
  call_window_end: z.number().int().min(1).max(23).optional(),
  time_zone: z.string().refine(validTz, { message: 'invalid_timezone' }).optional(),
});

// PATCH /:id was removed (9f): it had no membership/ownership check and no schedule regeneration,
// making it a security hole that any authenticated user could exploit. Mobile clients use PUT.

groupsRouter.put('/:id', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const parsed = patchSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You must be a member to edit group settings' });
    }

    const group = await prisma.group.findUnique({ where: { id: groupId } });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isOwner = group.owner_id === userId;

    // Prepare update data
    const updateData: any = {};

    // All members can change the name
    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }

    // Only owner can change cadence, frequency, and duration
    if (isOwner) {
      if (parsed.data.cadence !== undefined) {
        updateData.cadence = parsed.data.cadence;
        // WS-6: switching to daily always locks frequency to 1
        if (parsed.data.cadence === 'daily') updateData.daily_frequency = 1;
      }
      if (parsed.data.daily_frequency !== undefined) {
        updateData.daily_frequency = 1; // WS-6: daily is always 1x/day
      }
      if (parsed.data.weekly_frequency !== undefined) {
        updateData.weekly_frequency = parsed.data.weekly_frequency;
      }
      if (parsed.data.call_duration_minutes !== undefined) {
        updateData.call_duration_minutes = parsed.data.call_duration_minutes;
      }
      if (parsed.data.call_window_start !== undefined) {
        updateData.call_window_start = parsed.data.call_window_start;
      }
      if (parsed.data.call_window_end !== undefined) {
        updateData.call_window_end = parsed.data.call_window_end;
      }
      if (parsed.data.time_zone !== undefined) {
        updateData.time_zone = parsed.data.time_zone;
      }
    } else {
      // If non-owner tries to change owner-only fields, reject
      if (parsed.data.cadence !== undefined ||
          parsed.data.daily_frequency !== undefined ||
          parsed.data.weekly_frequency !== undefined ||
          parsed.data.call_duration_minutes !== undefined ||
          parsed.data.call_window_start !== undefined ||
          parsed.data.call_window_end !== undefined ||
          parsed.data.time_zone !== undefined) {
        return res.status(403).json({ error: 'Only the group owner can change frequency and duration settings' });
      }
    }

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: updateData,
    });

    console.log(`[update-group] User ${userId} updated group ${groupId}`);

    // If any scheduling-related field changed, cancel future scheduled calls and regenerate
    const schedulingChanged = isOwner && (
      updateData.cadence !== undefined ||
      updateData.daily_frequency !== undefined ||
      updateData.weekly_frequency !== undefined ||
      updateData.call_duration_minutes !== undefined ||
      updateData.call_window_start !== undefined ||
      updateData.call_window_end !== undefined ||
      updateData.time_zone !== undefined
    );

    if (schedulingChanged) {
      const now = new Date();
      const groupTz = updated.time_zone;
      // 9c: cancel from tomorrow onward only — today's call belongs to the old config and
      // shouldn't be silently deleted mid-day when an owner tweaks duration or cadence.
      const tomorrowStart = dayBoundsUtc(addDays(calendarDateInTz(now, groupTz), 1), groupTz).start;
      const cancelled = await prisma.callSession.updateMany({
        where: {
          group_id: groupId,
          status: 'scheduled',
          scheduled_at: { gte: tomorrowStart },
        },
        data: { status: 'ended', ended_at: now },
      });

      if (cancelled.count > 0) {
        console.log(`[update-group] Cancelled ${cancelled.count} stale scheduled calls for group ${groupId}`);
      }

      // Immediately regenerate with new config
      await scheduler.generateCallsForGroup(
        groupId, updated.cadence, updated.weekly_frequency,
        groupTz,
        updated.call_window_start, updated.call_window_end,
      );
      console.log(`[update-group] Regenerated schedule for group ${groupId}`);
    }

    res.json({
      id: updated.id,
      name: updated.name,
      cadence: updated.cadence,
      weekly_frequency: updated.weekly_frequency,
      call_duration_minutes: updated.call_duration_minutes,
      call_window_start: updated.call_window_start,
      call_window_end: updated.call_window_end,
      time_zone: updated.time_zone,
    });
  } catch (error) {
    console.error('[update-group] Error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

groupsRouter.delete('/:id', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify user is the group owner
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the group owner can delete the group' });
    }

    // Delete the group (cascading deletes will handle members, calls, etc.)
    await prisma.group.delete({ where: { id: groupId } });

    console.log(`[delete-group] User ${userId} deleted group ${groupId}`);

    res.status(204).send();
  } catch (error) {
    console.error('[delete-group] Error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

/**
 * Mute or unmute notifications for a group (any member)
 */
groupsRouter.put('/:id/mute', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const { muted } = req.body;

    if (typeof muted !== 'boolean') {
      return res.status(400).json({ error: 'muted must be a boolean' });
    }

    const membership = await prisma.groupMember.findFirst({
      where: { group_id: groupId, user_id: userId }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    await prisma.groupMember.update({
      where: { id: membership.id },
      data: { is_muted: muted }
    });

    res.json({ is_muted: muted });
  } catch (error) {
    console.error('[mute-group] Error:', error);
    res.status(500).json({ error: 'Failed to update mute setting' });
  }
});

/**
 * Create an invite code for a group (owner only)
 */
groupsRouter.post('/:id/invite', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify user is the group owner
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the group owner can create invites' });
    }

    // Generate a unique 8-character invite code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Invite expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.invite.create({
      data: {
        group_id: groupId,
        code,
        created_by: userId,
        expires_at: expiresAt
      }
    });

    res.json({
      invite_code: invite.code,
      expires_at: invite.expires_at.toISOString(),
      invite_link: `orbit://invite/${invite.code}`
    });
  } catch (error) {
    console.error('[create-invite] Error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

/**
 * Join a group using an invite code
 */
groupsRouter.post('/:id/join', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const { invite_code } = req.body;

    if (!invite_code) {
      return res.status(400).json({ error: 'Invite code required' });
    }

    const invite = await prisma.invite.findUnique({ where: { code: invite_code } });

    if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
    if (invite.group_id !== groupId) return res.status(400).json({ error: 'Invite code does not match group' });
    if (new Date() > invite.expires_at) return res.status(400).json({ error: 'Invite code has expired' });
    if (invite.revoked_at) return res.status(400).json({ error: 'Invite code has been revoked' });
    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      return res.status(400).json({ error: 'Invite code has reached its use limit' });
    }

    // Check if already a member before consuming a use
    const existing = await prisma.groupMember.findFirst({ where: { group_id: groupId, user_id: userId } });
    if (existing) return res.json({ status: 'already_member' });

    // Atomically claim one use — if max_uses is set, only succeed if use_count < max_uses
    const maxUsesCondition = invite.max_uses !== null
      ? { use_count: { lt: invite.max_uses } }
      : {};

    const claimed = await prisma.invite.updateMany({
      where: { id: invite.id, ...maxUsesCondition },
      data: { use_count: { increment: 1 }, used_by: userId, used_at: new Date() },
    });

    if (claimed.count === 0) {
      return res.status(400).json({ error: 'Invite code has reached its use limit' });
    }

    await prisma.groupMember.create({
      data: { group_id: groupId, user_id: userId, role: 'member' },
    });

    res.json({ status: 'joined' });
  } catch (error) {
    console.error('[join-group] Error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

groupsRouter.post('/:id/leave', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Prevent owner from leaving
    if (group.owner_id === userId) {
      return res.status(400).json({ error: 'Group owner cannot leave the group. Transfer ownership or delete the group instead.' });
    }

    // Verify user is a member
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(404).json({ error: 'You are not a member of this group' });
    }

    // Remove user from group
    await prisma.groupMember.deleteMany({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    console.log(`[leave-group] User ${userId} left group ${groupId}`);

    res.json({ status: 'left' });
  } catch (error) {
    console.error('[leave-group] Error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

/**
 * Remove a member from a group (owner only)
 */
groupsRouter.delete('/:id/members/:memberId', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const memberIdToRemove = req.params.memberId;
    const userId = (req as any).userId as string;

    // Verify user is the group owner
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the group owner can remove members' });
    }

    // Prevent owner from removing themselves
    if (memberIdToRemove === userId) {
      return res.status(400).json({ error: 'Owner cannot remove themselves from the group' });
    }

    // Remove the member
    const result = await prisma.groupMember.deleteMany({
      where: {
        group_id: groupId,
        user_id: memberIdToRemove
      }
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Member not found in group' });
    }

    console.log(`[remove-member] User ${userId} removed member ${memberIdToRemove} from group ${groupId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[remove-member] Error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * Transfer group ownership to another member (owner only)
 */
groupsRouter.post('/:id/transfer-ownership', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const { new_owner_id } = req.body;

    if (!new_owner_id) {
      return res.status(400).json({ error: 'new_owner_id is required' });
    }

    // Verify current user is the group owner
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the group owner can transfer ownership' });
    }

    // Prevent transferring to self
    if (new_owner_id === userId) {
      return res.status(400).json({ error: 'You are already the owner' });
    }

    // Verify new owner is a member of the group
    const newOwnerMembership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: new_owner_id
      }
    });

    if (!newOwnerMembership) {
      return res.status(400).json({ error: 'New owner must be a member of the group' });
    }

    // Update group ownership
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: { owner_id: new_owner_id }
    });

    console.log(`[transfer-ownership] User ${userId} transferred ownership of group ${groupId} to user ${new_owner_id}`);

    res.json({
      success: true,
      group: {
        id: updatedGroup.id,
        name: updatedGroup.name,
        owner_id: updatedGroup.owner_id
      }
    });
  } catch (error) {
    console.error('[transfer-ownership] Error:', error);
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

/**
 * Unauthenticated preview of a link-share invite.
 * Returns just enough to render a "join this group?" screen before sign-in.
 */
groupsRouter.get('/invites/:code/preview', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const now = new Date();

    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        group: {
          include: { members: { select: { user_id: true } } },
        },
        creator: { select: { username: true } },
      },
    });

    if (!invite) return res.status(404).json({ error: 'invalid_code' });
    if (invite.revoked_at) return res.status(410).json({ error: 'invite_revoked' });
    if (now > invite.expires_at) return res.status(410).json({ error: 'invite_expired' });
    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      return res.status(410).json({ error: 'invite_exhausted' });
    }

    res.json({
      group_id: invite.group_id,
      group_name: invite.group.name,
      cadence: invite.group.cadence,
      weekly_frequency: invite.group.weekly_frequency,
      call_duration_minutes: invite.group.call_duration_minutes,
      member_count: invite.group.members.length,
      invited_by: invite.creator.username,
      code: invite.code,
      expires_at: invite.expires_at.toISOString(),
    });
  } catch (error) {
    console.error('[invite-preview] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

/**
 * Get invite information (to find group ID from invite code)
 */
groupsRouter.get('/invites/:code/info', requireJwt, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();

    const invite = await prisma.invite.findUnique({
      where: { code },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    if (new Date() > invite.expires_at) {
      return res.status(400).json({ error: 'Invite code has expired' });
    }

    if (invite.used_by && invite.used_by !== (req as any).userId) {
      return res.status(400).json({ error: 'Invite code has already been used' });
    }

    res.json({
      group_id: invite.group_id,
      group_name: invite.group.name,
      code: invite.code,
      expires_at: invite.expires_at.toISOString()
    });
  } catch (error) {
    console.error('[invite-info] Error:', error);
    res.status(500).json({ error: 'Failed to get invite info' });
  }
});

/**
 * Send a direct invitation to a user by username (owner only)
 */
groupsRouter.post('/:id/invite-user', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Verify user is the group owner
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the group owner can send invitations' });
    }

    // Find the user to invite
    const invitedUser = await prisma.user.findUnique({
      where: { username },
      include: { devices: true }
    });

    if (!invitedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: {
        group_id_user_id: {
          group_id: groupId,
          user_id: invitedUser.id
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }

    // Check if user already has a pending invite
    const existingInvite = await prisma.invite.findFirst({
      where: {
        group_id: groupId,
        invited_user_id: invitedUser.id,
        status: 'pending'
      }
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'User already has a pending invitation' });
    }

    // Create the invitation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.invite.create({
      data: {
        group_id: groupId,
        created_by: userId,
        invited_user_id: invitedUser.id,
        status: 'pending',
        expires_at: expiresAt
      }
    });

    // Send push notification to invited user
    const tokens = invitedUser.devices.map(device => ({
      token: device.token,
      platform: device.platform as 'ios' | 'android'
    }));

    if (tokens.length > 0) {
      await notifications.sendPushTokens(
        tokens,
        'Group Invitation',
        `You've been invited to join ${group.name}`,
        {
          type: 'invitation_received',
          inviteId: invite.id,
          groupId: groupId
        }
      );
    }

    console.log(`[invite-user] User ${userId} invited ${username} to group ${groupId}`);

    res.json({
      success: true,
      invite_id: invite.id,
      invited_user: {
        id: invitedUser.id,
        username: invitedUser.username
      },
      expires_at: invite.expires_at.toISOString()
    });
  } catch (error) {
    console.error('[invite-user] Error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

/**
 * Respond to a direct invitation (accept, decline, or dismiss)
 */
groupsRouter.post('/invites/:id/respond', requireJwt, async (req, res) => {
  try {
    const inviteId = req.params.id;
    const userId = (req as any).userId as string;
    const { action } = req.body;

    if (!['accept', 'decline', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be accept, decline, or dismiss' });
    }

    // Find the invitation
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: { group: true }
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Verify the invite is for this user
    if (invite.invited_user_id !== userId) {
      return res.status(403).json({ error: 'This invitation is not for you' });
    }

    // Check if invite is still pending
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'This invitation has already been responded to' });
    }

    // Check if invite has expired
    if (new Date() > invite.expires_at) {
      return res.status(400).json({ error: 'This invitation has expired' });
    }

    if (action === 'accept') {
      // Check if user is already a member
      const existingMember = await prisma.groupMember.findUnique({
        where: {
          group_id_user_id: {
            group_id: invite.group_id,
            user_id: userId
          }
        }
      });

      if (existingMember) {
        return res.status(400).json({ error: 'You are already a member of this group' });
      }

      // Add user to group
      await prisma.groupMember.create({
        data: {
          group_id: invite.group_id,
          user_id: userId,
          role: 'member'
        }
      });

      // Update invite status
      await prisma.invite.update({
        where: { id: inviteId },
        data: {
          status: 'accepted',
          used_by: userId,
          used_at: new Date(),
          responded_at: new Date()
        }
      });

      console.log(`[respond-invite] User ${userId} accepted invitation ${inviteId}`);

      res.json({
        success: true,
        action: 'accepted',
        group: {
          id: invite.group.id,
          name: invite.group.name
        }
      });
    } else if (action === 'decline') {
      // Update invite status
      await prisma.invite.update({
        where: { id: inviteId },
        data: {
          status: 'declined',
          responded_at: new Date()
        }
      });

      console.log(`[respond-invite] User ${userId} declined invitation ${inviteId}`);

      res.json({
        success: true,
        action: 'declined'
      });
    } else if (action === 'dismiss') {
      // Keep status as pending, just update responded_at to track user saw it
      console.log(`[respond-invite] User ${userId} dismissed invitation ${inviteId}`);

      res.json({
        success: true,
        action: 'dismissed'
      });
    }
  } catch (error) {
    console.error('[respond-invite] Error:', error);
    res.status(500).json({ error: 'Failed to respond to invitation' });
  }
});

