import { Router } from 'express';
import { requireJwt } from '../util/requireJwt.js';
import { dailyVideo } from '../services/dailyVideo.js';
import { prisma } from '../db/prisma.js';
import { notifications } from '../services/notifications.js';

export const callsRouter = Router();

/**
 * Start an immediate "Call Now" for a group
 * Any member can trigger this
 */
callsRouter.post('/:id/call-now', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Get group details to determine call duration
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              include: { devices: true }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if there's already an active call
    const existingCall = await prisma.callSession.findFirst({
      where: {
        group_id: groupId,
        status: 'active'
      }
    });

    if (existingCall) {
      return res.status(400).json({ error: 'A call is already active for this group', call: existingCall });
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + group.call_duration_minutes * 60 * 1000);
    const roomName = `${groupId}_${startedAt.toISOString()}`;

    // Create Daily.co room
    const roomUrl = await dailyVideo.createRoom(roomName, endsAt);

    // Create call session in database
    const call = await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'active',
        started_at: startedAt,
        ends_at: endsAt,
        room_name: roomName,
        room_url: roomUrl,
      }
    });

    // Send push notifications to all group members
    const tokens = group.members.flatMap((m: any) =>
      m.user.devices.map((d: any) => ({
        token: d.token,
        platform: d.platform as 'ios' | 'android'
      }))
    );

    if (tokens.length > 0) {
      await notifications.sendPushTokens(
        tokens,
        `${group.name} is calling!`,
        'Tap to join the call',
        {
          type: 'call_started',
          callId: call.id,
          groupId: groupId
        }
      );
    }

    console.log(`[call-now] User ${userId} started call ${call.id} for group ${groupId}`);

    res.json({
      id: call.id,
      group_id: groupId,
      status: call.status,
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
      participant_count: 0,
      room_name: call.room_name
    });
  } catch (error) {
    console.error('[call-now] Error:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
});

/**
 * Get the current active call for a group
 */
callsRouter.get('/:id/calls/current', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const call = await prisma.callSession.findFirst({
      where: {
        group_id: groupId,
        status: 'active'
      },
      orderBy: { started_at: 'desc' },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          },
          where: {
            left_at: null
          }
        }
      }
    });

    if (!call) {
      return res.json({ current: null });
    }

    res.json({
      current: {
        id: call.id,
        group_id: call.group_id,
        status: call.status,
        started_at: call.started_at,
        ends_at: call.ends_at,
        room_name: call.room_name,
        participant_count: call.participants.length,
        participants: call.participants.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.user.username,
          joined_at: p.joined_at
        }))
      }
    });
  } catch (error) {
    console.error('[current-call] Error:', error);
    res.status(500).json({ error: 'Failed to get current call' });
  }
});

/**
 * Get call history for a group
 */
callsRouter.get('/:id/calls/history', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const calls = await prisma.callSession.findMany({
      where: {
        group_id: groupId,
        status: 'ended'
      },
      orderBy: { ended_at: 'desc' },
      take: 50,
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }
      }
    });

    res.json({
      calls: calls.map((call: any) => ({
        id: call.id,
        group_id: call.group_id,
        status: call.status,
        started_at: call.started_at,
        ended_at: call.ended_at,
        duration_minutes: call.started_at && call.ended_at
          ? Math.round((call.ended_at.getTime() - call.started_at.getTime()) / 60000)
          : null,
        participant_count: call.participants.length
      }))
    });
  } catch (error) {
    console.error('[call-history] Error:', error);
    res.status(500).json({ error: 'Failed to get call history' });
  }
});

/**
 * Get a Twilio access token to join a call
 */
callsRouter.post('/:id/calls/:callId/join-token', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const callId = req.params.callId;
    const userId = (req as any).userId as string;

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: groupId,
        user_id: userId
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Verify the call exists and is active
    const call = await prisma.callSession.findUnique({
      where: { id: callId }
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    if (call.status !== 'active') {
      return res.status(400).json({ error: 'Call is not active' });
    }

    if (call.group_id !== groupId) {
      return res.status(400).json({ error: 'Call does not belong to this group' });
    }

    if (!call.room_name) {
      return res.status(500).json({ error: 'Call room name not found' });
    }

    // Record participant joining
    await prisma.callParticipant.create({
      data: {
        call_id: callId,
        user_id: userId,
        joined_at: new Date()
      }
    });

    // Generate Daily.co meeting token
    const token = await dailyVideo.createMeetingToken(call.room_name, userId, call.ends_at);

    console.log(`[join-token] User ${userId} joining call ${callId}`);

    res.json({
      token,
      room_name: call.room_name,
      room_url: call.room_url,
      ends_at: call.ends_at
    });
  } catch (error) {
    console.error('[join-token] Error:', error);
    res.status(500).json({ error: 'Failed to generate join token' });
  }
});

/**
 * Record when a participant leaves a call
 */
callsRouter.post('/:id/calls/:callId/leave', requireJwt, async (req, res) => {
  try {
    const callId = req.params.callId;
    const userId = (req as any).userId as string;

    // Find the participant's current session
    const participant = await prisma.callParticipant.findFirst({
      where: {
        call_id: callId,
        user_id: userId,
        left_at: null
      },
      orderBy: {
        joined_at: 'desc'
      }
    });

    if (participant) {
      await prisma.callParticipant.update({
        where: { id: participant.id },
        data: { left_at: new Date() }
      });

      console.log(`[leave-call] User ${userId} left call ${callId}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[leave-call] Error:', error);
    res.status(500).json({ error: 'Failed to record leave event' });
  }
});
