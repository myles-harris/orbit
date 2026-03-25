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
      // Block spontaneous calls if scheduled call is active
      if (existingCall.call_type === 'scheduled') {
        return res.status(400).json({
          error: 'Cannot start spontaneous call while scheduled call is active',
          call: existingCall
        });
      }
      return res.status(400).json({ error: 'A call is already active for this group', call: existingCall });
    }

    const startedAt = new Date();
    // Spontaneous calls have no fixed end time - they stay open until all participants leave
    const endsAt = null;
    // Replace invalid characters (: and .) with valid ones for Daily.co room names
    const roomName = `${groupId}_${startedAt.toISOString().replace(/[:.]/g, '-')}`;

    // Create Daily.co room with no expiry (will be closed when last participant leaves)
    const roomUrl = await dailyVideo.createRoom(roomName);

    // Create call session in database
    const call = await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'active',
        call_type: 'spontaneous',
        started_at: startedAt,
        ends_at: endsAt,
        room_name: roomName,
        room_url: roomUrl,
      }
    });

    // Send push notifications to all group members except the caller and muted members
    const tokens = group.members
      .filter((m: any) => m.user_id !== userId && !m.is_muted)
      .flatMap((m: any) =>
        m.user.devices.map((d: any) => ({
          token: d.token,
          platform: d.platform as 'ios' | 'android'
        }))
      );

    console.log(`[call-now] Found ${tokens.length} device tokens for ${group.members.length - 1} other group members (excluding caller)`);

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
    } else {
      console.log(`[call-now] No push tokens registered for group ${groupId}`);
    }

    console.log(`[call-now] User ${userId} started spontaneous call ${call.id} for group ${groupId}`);

    res.json({
      id: call.id,
      group_id: groupId,
      status: call.status,
      call_type: 'spontaneous',
      started_at: startedAt.toISOString(),
      ends_at: null, // Spontaneous calls have no fixed end time
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
    const token = await dailyVideo.createMeetingToken(call.room_name, userId, call.ends_at ?? undefined);

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

      // For spontaneous calls, check if all participants have left
      const call = await prisma.callSession.findUnique({
        where: { id: callId },
        include: {
          participants: {
            where: {
              left_at: null // Still in the call
            }
          }
        }
      });

      if (call && call.call_type === 'spontaneous' && call.participants.length === 0) {
        // All participants have left - close the spontaneous call
        await prisma.callSession.update({
          where: { id: callId },
          data: {
            status: 'ended',
            ended_at: new Date()
          }
        });

        // Delete the Daily.co room
        if (call.room_name) {
          await dailyVideo.deleteRoom(call.room_name);
        }

        console.log(`[leave-call] Spontaneous call ${callId} closed - all participants left`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[leave-call] Error:', error);
    res.status(500).json({ error: 'Failed to record leave event' });
  }
});

/**
 * End an active call for all participants and delete the room
 * Called by the client when the countdown timer reaches zero
 */
callsRouter.post('/:id/calls/:callId/end', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const callId = req.params.callId;
    const userId = (req as any).userId as string;

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: { group_id: groupId, user_id: userId }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const call = await prisma.callSession.findFirst({
      where: { id: callId, group_id: groupId, status: 'active' }
    });

    if (!call) {
      // Already ended — idempotent success
      return res.json({ success: true });
    }

    // Delete the Daily.co room — this kicks all remaining participants immediately
    if (call.room_name) {
      await dailyVideo.deleteRoom(call.room_name);
    }

    await prisma.callSession.update({
      where: { id: callId },
      data: { status: 'ended', ended_at: new Date() }
    });

    console.log(`[end-call] User ${userId} ended call ${callId} for group ${groupId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[end-call] Error:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

/**
 * DEV: Get all scheduled calls for a group
 * Useful for testing and debugging
 */
callsRouter.get('/:id/scheduled', requireJwt, async (req, res) => {
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

    // Get all scheduled calls (pending, active, and past)
    const calls = await prisma.callSession.findMany({
      where: {
        group_id: groupId,
        call_type: 'scheduled'
      },
      orderBy: {
        scheduled_at: 'asc'
      }
    });

    console.log(`[get-scheduled-calls] User ${userId} fetched ${calls.length} scheduled calls for group ${groupId}`);

    res.json({
      calls: calls.map(call => ({
        id: call.id,
        status: call.status,
        scheduled_at: call.scheduled_at?.toISOString(),
        started_at: call.started_at?.toISOString(),
        ends_at: call.ends_at?.toISOString(),
        ended_at: call.ended_at?.toISOString(),
        room_name: call.room_name,
        room_url: call.room_url
      }))
    });
  } catch (error) {
    console.error('[get-scheduled-calls] Error:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled calls' });
  }
});

/**
 * DEV: Create a scheduled call for testing
 * Allows developers to manually create scheduled calls
 */
callsRouter.post('/:id/scheduled', requireJwt, async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = (req as any).userId as string;
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({ error: 'scheduled_at is required (ISO 8601 format)' });
    }

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

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Parse and validate scheduled time
    const scheduledTime = new Date(scheduled_at);
    if (isNaN(scheduledTime.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled_at format. Use ISO 8601 format.' });
    }

    // Create scheduled call
    const roomName = `${groupId}_${scheduledTime.toISOString().replace(/[:.]/g, '-')}`;
    const call = await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: scheduledTime,
        ends_at: new Date(scheduledTime.getTime() + group.call_duration_minutes * 60 * 1000),
        room_name: roomName
      }
    });

    console.log(`[create-scheduled-call] User ${userId} created scheduled call ${call.id} for group ${groupId} at ${scheduledTime.toISOString()}`);

    res.json({
      id: call.id,
      group_id: call.group_id,
      status: call.status,
      call_type: call.call_type,
      scheduled_at: call.scheduled_at?.toISOString(),
      ends_at: call.ends_at?.toISOString()
    });
  } catch (error) {
    console.error('[create-scheduled-call] Error:', error);
    res.status(500).json({ error: 'Failed to create scheduled call' });
  }
});

/**
 * DEV: Update a scheduled call
 * Allows developers to modify scheduled call times for testing
 */
callsRouter.patch('/:groupId/scheduled/:callId', requireJwt, async (req, res) => {
  try {
    const { groupId, callId } = req.params;
    const userId = (req as any).userId as string;
    const { scheduled_at } = req.body;

    if (!scheduled_at) {
      return res.status(400).json({ error: 'scheduled_at is required (ISO 8601 format)' });
    }

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

    // Verify call exists and belongs to this group
    const call = await prisma.callSession.findFirst({
      where: {
        id: callId,
        group_id: groupId,
        call_type: 'scheduled'
      }
    });

    if (!call) {
      return res.status(404).json({ error: 'Scheduled call not found' });
    }

    // Can only modify scheduled calls that haven't started
    if (call.status !== 'scheduled') {
      return res.status(400).json({ error: 'Can only modify calls with status "scheduled"' });
    }

    // Parse and validate new scheduled time
    const newScheduledTime = new Date(scheduled_at);
    if (isNaN(newScheduledTime.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled_at format. Use ISO 8601 format.' });
    }

    // Get group to calculate new ends_at
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Update the call
    const updatedCall = await prisma.callSession.update({
      where: { id: callId },
      data: {
        scheduled_at: newScheduledTime,
        ends_at: new Date(newScheduledTime.getTime() + group.call_duration_minutes * 60 * 1000)
      }
    });

    console.log(`[update-scheduled-call] User ${userId} updated scheduled call ${callId} to ${newScheduledTime.toISOString()}`);

    res.json({
      id: updatedCall.id,
      group_id: updatedCall.group_id,
      status: updatedCall.status,
      call_type: updatedCall.call_type,
      scheduled_at: updatedCall.scheduled_at?.toISOString(),
      ends_at: updatedCall.ends_at?.toISOString()
    });
  } catch (error) {
    console.error('[update-scheduled-call] Error:', error);
    res.status(500).json({ error: 'Failed to update scheduled call' });
  }
});

/**
 * DEV: Delete a scheduled call
 * Allows developers to remove scheduled calls for testing
 */
callsRouter.delete('/:groupId/scheduled/:callId', requireJwt, async (req, res) => {
  try {
    const { groupId, callId } = req.params;
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

    // Verify call exists and belongs to this group
    const call = await prisma.callSession.findFirst({
      where: {
        id: callId,
        group_id: groupId,
        call_type: 'scheduled'
      }
    });

    if (!call) {
      return res.status(404).json({ error: 'Scheduled call not found' });
    }

    // Can only delete scheduled calls that haven't started
    if (call.status !== 'scheduled') {
      return res.status(400).json({ error: 'Can only delete calls with status "scheduled"' });
    }

    // Delete the call
    await prisma.callSession.delete({
      where: { id: callId }
    });

    console.log(`[delete-scheduled-call] User ${userId} deleted scheduled call ${callId} from group ${groupId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[delete-scheduled-call] Error:', error);
    res.status(500).json({ error: 'Failed to delete scheduled call' });
  }
});
