import { Router } from 'express';
import { requireJwt } from '../util/requireJwt.js';
import { twilioVideo } from '../services/twilioVideo.js';
import { prisma } from '../db/prisma.js';
import { notifications } from '../services/notifications.js';

export const callsRouter = Router();

// Any member can start now
callsRouter.post('/:id/call-now', requireJwt, async (req, res) => {
  const groupId = req.params.id;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + 30 * 60 * 1000);
  const call = await prisma.callSession.create({
    data: {
      group_id: groupId,
      status: 'active' as any,
      started_at: startedAt,
      ends_at: endsAt,
      room_name: `${groupId}_${startedAt.toISOString()}`,
    }
  });
  // Notify group members via push; fallback to SMS if no devices
  const members = await prisma.groupMember.findMany({
    where: { group_id: groupId },
    include: { user: { include: { devices: true } } }
  });
  const tokens = members.flatMap(m => m.user.devices.map(d => ({ token: d.token, platform: (d.platform as 'ios' | 'android') })));
  const title = 'Your group call is starting';
  const body = 'Tap to join now';
  if (tokens.length > 0) {
    await notifications.sendPushTokens(tokens, title, body);
  }
  res.json({ id: call.id, group_id: groupId, status: call.status, started_at: startedAt.toISOString(), ends_at: endsAt.toISOString(), participant_count: 0, room_name: call.room_name });
});

callsRouter.get('/:id/calls/current', requireJwt, async (req, res) => {
  const call = await prisma.callSession.findFirst({ where: { group_id: req.params.id, status: 'active' as any }, orderBy: { started_at: 'desc' } });
  res.json({ current: call ? { id: call.id, group_id: call.group_id, status: call.status, started_at: call.started_at, ends_at: call.ends_at, room_name: call.room_name } : null });
});

callsRouter.get('/:id/calls/history', requireJwt, async (req, res) => {
  const calls = await prisma.callSession.findMany({ where: { group_id: req.params.id, status: 'ended' as any }, orderBy: { ended_at: 'desc' }, take: 50 });
  res.json({ calls });
});

callsRouter.post('/:id/calls/:callId/join-token', requireJwt, async (req, res) => {
  const userId = (req as any).userId as string;
  const roomName = `${req.params.id}_${req.params.callId}`;
  const token = twilioVideo.createParticipantToken(userId, roomName);
  res.json({ token, room_name: roomName });
});

