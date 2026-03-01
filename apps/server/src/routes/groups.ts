import { Router } from 'express';
import { z } from 'zod';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';

export const groupsRouter = Router();

const createSchema = z.object({
  name: z.string(),
  cadence: z.enum(['daily', 'weekly']),
  weekly_frequency: z.number().int().min(1).max(7).optional(),
  call_duration_minutes: z.number().int().min(5).max(120)
});

groupsRouter.post('/', requireJwt, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const userId = (req as any).userId as string;
  const group = await prisma.group.create({
    data: {
      name: parsed.data.name,
      owner_id: userId,
      cadence: parsed.data.cadence as any,
      weekly_frequency: parsed.data.cadence === 'weekly' ? (parsed.data.weekly_frequency ?? 1) : null,
      call_duration_minutes: parsed.data.call_duration_minutes,
      members: { create: { user_id: userId, role: 'owner' } },
    },
    include: { members: true },
  });
  res.status(201).json({
    id: group.id,
    name: group.name,
    owner_id: group.owner_id,
    cadence: group.cadence,
    weekly_frequency: group.weekly_frequency,
    call_duration_minutes: group.call_duration_minutes,
    member_count: group.members.length,
    members: group.members.map((m: any) => ({ user_id: m.user_id, role: m.role })),
    created_at: group.created_at,
  });
});

groupsRouter.get('/', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  const memberships = await prisma.groupMember.findMany({ where: { user_id: userId }, include: { group: { include: { members: true } } } });
  const groups = memberships.map((m: any) => ({
    id: m.group.id,
    name: m.group.name,
    owner_id: m.group.owner_id,
    cadence: m.group.cadence,
    weekly_frequency: m.group.weekly_frequency,
    call_duration_minutes: m.group.call_duration_minutes,
    member_count: m.group.members.length,
    members: m.group.members.map((mm: any) => ({ user_id: mm.user_id, role: mm.role })),
    created_at: m.group.created_at,
  }));
  res.json({ groups });
});

groupsRouter.get('/:id', requireJwt, async (req, res) => {
  const grp = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      members: { include: { user: { select: { id: true, username: true } } } },
      calls: { orderBy: { started_at: 'desc' }, take: 1 },
    },
  });
  if (!grp) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: grp.id,
    name: grp.name,
    owner_id: grp.owner_id,
    cadence: grp.cadence,
    weekly_frequency: grp.weekly_frequency,
    call_duration_minutes: grp.call_duration_minutes,
    member_count: grp.members.length,
    members: grp.members.map((m: any) => ({ user_id: m.user_id, username: m.user.username, role: m.role })),
    last_call: grp.calls[0] ? { id: grp.calls[0].id, ended_at: grp.calls[0].ended_at?.toISOString?.() ?? '' } : null,
    created_at: grp.created_at,
  });
});

const patchSchema = z.object({
  name: z.string().optional(),
  cadence: z.enum(['daily', 'weekly']).optional(),
  weekly_frequency: z.number().int().min(1).max(7).optional(),
  call_duration_minutes: z.number().int().min(5).max(120).optional(),
});
groupsRouter.patch('/:id', requireJwt, async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: parsed.data as any,
  });
  res.json({ id: updated.id, ...parsed.data });
});

groupsRouter.delete('/:id', requireJwt, async (req, res) => {
  await prisma.group.delete({ where: { id: req.params.id } });
  res.status(204).send();
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
      invite_link: `take5://invite/${invite.code}`
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

    // If no invite code, check if group is public (for now, require invite)
    if (!invite_code) {
      return res.status(400).json({ error: 'Invite code required' });
    }

    // Verify invite code
    const invite = await prisma.invite.findUnique({
      where: { code: invite_code }
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    if (invite.group_id !== groupId) {
      return res.status(400).json({ error: 'Invite code does not match group' });
    }

    if (new Date() > invite.expires_at) {
      return res.status(400).json({ error: 'Invite code has expired' });
    }

    if (invite.used_by && invite.used_by !== userId) {
      return res.status(400).json({ error: 'Invite code has already been used' });
    }

    // Check if already a member
    const existing = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (existing) {
      return res.json({ status: 'already_member' });
    }

    // Add user to group
    await prisma.groupMember.create({
      data: {
        group_id: groupId,
        user_id: userId,
        role: 'member'
      }
    });

    // Mark invite as used
    await prisma.invite.update({
      where: { id: invite.id },
      data: {
        used_by: userId,
        used_at: new Date()
      }
    });

    res.json({ status: 'joined' });
  } catch (error) {
    console.error('[join-group] Error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

groupsRouter.post('/:id/leave', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  await prisma.groupMember.deleteMany({ where: { group_id: req.params.id, user_id: userId } });
  res.json({ status: 'left' });
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

