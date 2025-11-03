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
    members: group.members.map(m => ({ user_id: m.user_id, role: m.role })),
    created_at: group.created_at,
  });
});

groupsRouter.get('/', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  const memberships = await prisma.groupMember.findMany({ where: { user_id: userId }, include: { group: { include: { members: true } } } });
  const groups = memberships.map(m => ({
    id: m.group.id,
    name: m.group.name,
    owner_id: m.group.owner_id,
    cadence: m.group.cadence,
    weekly_frequency: m.group.weekly_frequency,
    call_duration_minutes: m.group.call_duration_minutes,
    member_count: m.group.members.length,
    members: m.group.members.map(mm => ({ user_id: mm.user_id, role: mm.role })),
    created_at: m.group.created_at,
  }));
  res.json({ groups });
});

groupsRouter.get('/:id', requireJwt, async (req, res) => {
  const grp = await prisma.group.findUnique({ where: { id: req.params.id }, include: { members: true, calls: { orderBy: { started_at: 'desc' }, take: 1 } } });
  if (!grp) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: grp.id,
    name: grp.name,
    owner_id: grp.owner_id,
    cadence: grp.cadence,
    weekly_frequency: grp.weekly_frequency,
    call_duration_minutes: grp.call_duration_minutes,
    member_count: grp.members.length,
    members: grp.members.map(m => ({ user_id: m.user_id, role: m.role })),
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

groupsRouter.post('/:id/invite', requireJwt, async (_req, res) => {
  res.json({ status: 'invite_sent' });
});

groupsRouter.post('/:id/join', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  await prisma.groupMember.upsert({
    where: { group_id_user_id: { group_id: req.params.id, user_id: userId } } as any,
    update: {},
    create: { group_id: req.params.id, user_id: userId, role: 'member' as any },
  });
  res.json({ status: 'joined' });
});

groupsRouter.post('/:id/leave', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  await prisma.groupMember.deleteMany({ where: { group_id: req.params.id, user_id: userId } });
  res.json({ status: 'left' });
});

