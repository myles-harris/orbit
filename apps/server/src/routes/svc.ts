import { Router } from 'express';
import { prisma } from '../db/prisma.js';

export const svcRouter = Router();

// Worker roll-over to generate future schedules
svcRouter.post('/schedule/rollover', async (_req, res) => {
  res.json({ status: 'ok' });
});

// Trigger a scheduled call (internal)
svcRouter.post('/schedule/trigger', async (_req, res) => {
  res.json({ status: 'triggered' });
});

// Force-close a room
svcRouter.post('/calls/:id/close', async (req, res) => {
  res.json({ id: req.params.id, status: 'closed' });
});

// DEV: Get upcoming scheduled calls for a group
svcRouter.get('/groups/:groupId/upcoming', async (req, res) => {
  try {
    const { groupId } = req.params;
    const now = new Date();

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const calls = await prisma.callSession.findMany({
      where: {
        group_id: groupId,
        call_type: 'scheduled',
        status: 'scheduled',
        scheduled_at: { gte: now }
      },
      orderBy: { scheduled_at: 'asc' }
    });

    res.json({
      group_id: group.id,
      group_name: group.name,
      upcoming_count: calls.length,
      calls: calls.map(c => ({
        id: c.id,
        scheduled_at: c.scheduled_at?.toISOString(),
        ends_at: c.ends_at?.toISOString(),
        room_name: c.room_name
      }))
    });
  } catch (error) {
    console.error('[svc/upcoming-calls] Error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming calls' });
  }
});

