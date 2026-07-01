import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';

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

/**
 * Daily.co webhook receiver
 *
 * Handles participant disconnects so that force-closing the app vacates the
 * participant and, for spontaneous calls, closes the room when no one remains.
 *
 * Configure this URL in the Daily.co dashboard under Webhooks:
 *   https://<your-domain>/svc/daily/webhook
 *
 * Daily.co retries delivery on non-2xx responses, so we always return 200
 * immediately and process asynchronously.
 *
 * To enable signature verification, set DAILY_WEBHOOK_SECRET in .env.
 */
svcRouter.post('/daily/webhook', async (req, res) => {
  res.json({ received: true });

  const { type, properties } = req.body ?? {};
  if (type !== 'participant-left' || !properties) return;

  const { room_name, user_id, user_name } = properties;
  // user_id is set via the token's user_id field; user_name is a fallback for
  // tokens issued before user_id was populated.
  const userId: string | undefined = user_id || user_name;

  if (!room_name || !userId) {
    console.warn('[daily-webhook] participant-left missing room_name or user identifier');
    return;
  }

  try {
    const call = await prisma.callSession.findFirst({
      where: { room_name, status: 'active' },
    });

    if (!call) {
      console.log(`[daily-webhook] No active call for room ${room_name} — already ended`);
      return;
    }

    const participant = await prisma.callParticipant.findFirst({
      where: { call_id: call.id, user_id: userId, left_at: null },
      orderBy: { joined_at: 'desc' },
    });

    if (!participant) {
      console.log(`[daily-webhook] User ${userId} has no active participant record in call ${call.id}`);
      return;
    }

    await prisma.callParticipant.update({
      where: { id: participant.id },
      data: { left_at: new Date() },
    });

    console.log(`[daily-webhook] Recorded disconnect for user ${userId} in call ${call.id}`);

    if (call.call_type === 'spontaneous') {
      const remaining = await prisma.callParticipant.count({
        where: { call_id: call.id, left_at: null },
      });

      if (remaining === 0) {
        await scheduler.closeCall(call.id);
        console.log(`[daily-webhook] Closed empty spontaneous call ${call.id}`);
      }
    }
  } catch (error) {
    console.error('[daily-webhook] Error processing participant-left:', error);
  }
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

