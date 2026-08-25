import { Router, Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { scheduler } from '../services/scheduler.js';
import { dailyVideo } from '../services/dailyVideo.js';
import { broadcastCallPresence } from '../services/callPresence.js';

export const svcRouter = Router();

const DAILY_WEBHOOK_SECRET = process.env.DAILY_WEBHOOK_SECRET;
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Verifies Daily's HMAC-SHA256 webhook signature: base64(hmacSha256(base64Decode(secret),
 * `${timestamp}.${rawBody}`)), compared against the X-Webhook-Signature header. The
 * timestamp header is also bounded to reject replayed requests.
 *
 * Fails open (with a warning) when DAILY_WEBHOOK_SECRET is unset, matching this stage's
 * "no env change needed to ship" pattern elsewhere — but this route becomes a genuine
 * broadcast trigger the moment PRESENCE_ENABLED is on, so the secret should be set in
 * every environment that isn't purely local.
 */
function verifyDailyWebhook(req: Request): boolean {
  if (!DAILY_WEBHOOK_SECRET) {
    console.warn('[daily-webhook] DAILY_WEBHOOK_SECRET not set — accepting unauthenticated webhook');
    return true;
  }

  const timestamp = req.header('X-Webhook-Timestamp');
  const signature = req.header('X-Webhook-Signature');
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!timestamp || !signature || !rawBody) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WEBHOOK_MAX_AGE_MS) {
    return false;
  }

  let key: Buffer;
  try {
    key = Buffer.from(DAILY_WEBHOOK_SECRET, 'base64');
  } catch {
    return false;
  }
  const expected = createHmac('sha256', key).update(`${timestamp}.${rawBody.toString()}`).digest('base64');

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

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
 * Rejects requests that don't carry a valid HMAC signature once DAILY_WEBHOOK_SECRET
 * is set in .env — see verifyDailyWebhook above.
 */
svcRouter.post('/daily/webhook', async (req, res) => {
  if (!verifyDailyWebhook(req)) {
    console.warn('[daily-webhook] Rejected request with missing or invalid signature');
    return res.status(401).json({ error: 'invalid_signature' });
  }

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
    broadcastCallPresence(call.id);

    console.log(`[daily-webhook] Recorded disconnect for user ${userId} in call ${call.id}`);

    if (call.call_type === 'spontaneous') {
      const remaining = await prisma.callParticipant.count({
        where: { call_id: call.id, left_at: null },
      });

      if (remaining === 0) {
        const presence = call.room_name
          ? await dailyVideo.getRoomPresenceCount(call.room_name)
          : null;

        if (presence !== null && presence > 0) {
          console.warn(
            `[daily-webhook] Call ${call.id} empty in DB but Daily reports ` +
            `${presence} connected — skipping close`
          );
          return;
        }

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

