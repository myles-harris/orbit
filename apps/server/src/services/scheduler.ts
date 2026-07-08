import { PrismaClient, Cadence, CallStatus } from '@prisma/client';
import { dailyVideo, buildRoomName } from './dailyVideo.js';
import { notifications } from './notifications.js';
import { calendarDateInTz, addDays, randomTimeInWindow, dayBoundsUtc } from '../util/scheduleTime.js';

/** A participant is stale after this long with no heartbeat (client beats every 10s). */
const HEARTBEAT_STALE_MS = 90 * 1000;

const prisma = new PrismaClient();

/**
 * Scheduler service for managing random call times
 */
export const scheduler = {
  /**
   * Generate random call sessions for all groups
   * Called daily to ensure upcoming calls are scheduled
   */
  async generateScheduledCalls() {
    console.log('[scheduler] Generating scheduled calls...');

    try {
      // Get all groups
      const groups = await prisma.group.findMany({
        include: {
          members: true
        }
      });

      for (const group of groups) {
        await this.generateCallsForGroup(group.id, group.cadence, group.weekly_frequency);
      }

      console.log(`[scheduler] Generated calls for ${groups.length} groups`);
    } catch (error) {
      console.error('[scheduler] Error generating scheduled calls:', error);
    }
  },

  /**
   * Generate scheduled calls for a specific group.
   * All times fall within [6:00 AM, 10:00 PM) America/Los_Angeles, DST-correct.
   */
  async generateCallsForGroup(groupId: string, cadence: Cadence, weeklyFrequency: number | null) {
    const todayPT = calendarDateInTz(new Date());
    const tomorrowPT = addDays(todayPT, 1);

    if (cadence === 'daily') {
      const { start, end } = dayBoundsUtc(tomorrowPT);

      const existingCall = await prisma.callSession.findFirst({
        where: {
          group_id: groupId,
          status: 'scheduled',
          scheduled_at: { gte: start, lt: end },
        },
      });

      if (!existingCall) {
        const randomTime = randomTimeInWindow(tomorrowPT);
        await this.createScheduledCall(groupId, randomTime);
        console.log(`[scheduler] Scheduled daily call for group ${groupId} at ${randomTime.toISOString()}`);
      }
    } else if (cadence === 'weekly') {
      const weekStart = dayBoundsUtc(tomorrowPT).start;
      const weekEnd = dayBoundsUtc(addDays(tomorrowPT, 7)).start;

      const frequency = weeklyFrequency || 1;

      const existingCalls = await prisma.callSession.count({
        where: {
          group_id: groupId,
          status: 'scheduled',
          scheduled_at: { gte: weekStart, lt: weekEnd },
        },
      });

      const callsToCreate = frequency - existingCalls;

      if (callsToCreate > 0) {
        // Pick distinct PT calendar days (max 1 call/day), random time in window on each.
        const dayOffsets = Array.from({ length: 7 }, (_, i) => i)
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.min(callsToCreate, 7));

        const times = dayOffsets
          .map(offset => randomTimeInWindow(addDays(tomorrowPT, offset)))
          .sort((a, b) => a.getTime() - b.getTime());

        for (const time of times) {
          await this.createScheduledCall(groupId, time);
        }

        console.log(`[scheduler] Scheduled ${times.length} weekly call(s) for group ${groupId}`);
      }
    }
  },

  /**
   * Create a scheduled call session
   */
  async createScheduledCall(groupId: string, scheduledAt: Date) {
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      console.error(`[scheduler] Group ${groupId} not found`);
      return;
    }

    const endsAt = new Date(scheduledAt);
    endsAt.setMinutes(endsAt.getMinutes() + group.call_duration_minutes);

    const roomName = buildRoomName(groupId, scheduledAt);

    await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: scheduledAt,
        ends_at: endsAt,
        room_name: roomName
      }
    });
  },

  /**
   * Activate scheduled calls that are due to start
   */
  async activateDueCalls() {
    const now = new Date();

    try {
      const RECLAIM_AFTER_MS = 2 * 60 * 1000;

      // Recover calls orphaned in 'activating' by a crash or redeploy mid-activation.
      const reclaimed = await prisma.callSession.updateMany({
        where: {
          status: 'activating',
          claimed_at: { lt: new Date(Date.now() - RECLAIM_AFTER_MS) },
          ends_at: { gt: now },
        },
        data: { status: 'scheduled', claimed_at: null },
      });
      if (reclaimed.count > 0) {
        console.warn(`[scheduler] Reclaimed ${reclaimed.count} call(s) stuck in 'activating'`);
      }

      // Mark stuck activating calls whose window has passed as ended.
      await prisma.callSession.updateMany({
        where: { status: 'activating', ends_at: { lte: now } },
        data: { status: 'ended', ended_at: now },
      });

      const dueCalls = await prisma.callSession.findMany({
        where: {
          status: 'scheduled',
          scheduled_at: { lte: now },
          ends_at: { gt: now },
        },
      });

      for (const call of dueCalls) {
        // Atomically claim this call — only one worker instance can win.
        const claimed = await prisma.callSession.updateMany({
          where: { id: call.id, status: 'scheduled' },
          data: { status: 'activating', claimed_at: now },
        });

        if (claimed.count === 0) {
          console.log(`[scheduler] Call ${call.id} already claimed by another worker, skipping`);
          continue;
        }

        try {
          await this.activateCall(call.id);
        } catch (err) {
          console.error(`[scheduler] Failed to activate call ${call.id}, releasing claim:`, err);
          await prisma.callSession.update({
            where: { id: call.id },
            data: { status: 'scheduled', claimed_at: null },
          });
          // Do not rethrow — continue activating remaining due calls.
        }
      }

      if (dueCalls.length > 0) {
        console.log(`[scheduler] Processed ${dueCalls.length} due call(s)`);
      }
    } catch (error) {
      console.error('[scheduler] Error activating due calls:', error);
      throw error;
    }
  },

  /**
   * Activate a specific call session
   */
  async activateCall(callId: string) {
    try {
      const call = await prisma.callSession.findUnique({
        where: { id: callId }
      });

      if (!call || !call.room_name) {
        console.error(`[scheduler] Call ${callId} not found or missing room name`);
        return;
      }

      const group = await prisma.group.findUnique({
        where: { id: call.group_id },
        include: {
          members: {
            include: { user: { include: { devices: true } } },
          },
        },
      });

      if (!group) {
        console.error(`[scheduler] Group ${call.group_id} not found for call ${callId}`);
        return;
      }

      // Sanitize room name - Daily.co only allows A-Z, a-z, 0-9, '-', and '_'
      const sanitizedRoomName = call.room_name.replace(/[^A-Za-z0-9\-_]/g, '-');
      if (sanitizedRoomName !== call.room_name) {
        await prisma.callSession.update({ where: { id: callId }, data: { room_name: sanitizedRoomName } });
        (call as any).room_name = sanitizedRoomName;
      }

      // Check for active spontaneous calls and close them first
      const activeSpontaneousCall = await prisma.callSession.findFirst({
        where: {
          group_id: group.id,
          status: 'active',
          call_type: 'spontaneous',
        }
      });

      if (activeSpontaneousCall) {
        await prisma.callSession.update({
          where: { id: activeSpontaneousCall.id },
          data: { status: 'ended', ended_at: new Date() },
        });

        if (activeSpontaneousCall.room_name) {
          await dailyVideo.deleteRoom(activeSpontaneousCall.room_name);
        }

        const spontaneousTokens = group.members.flatMap((m: any) =>
          m.user.devices.map((d: any) => ({ token: d.token, platform: d.platform as 'ios' | 'android' }))
        );
        if (spontaneousTokens.length > 0) {
          await notifications.sendSilentPushTokens(spontaneousTokens, {
            type: 'call_ended',
            callId: activeSpontaneousCall.id,
            groupId: group.id,
          });
        }

        console.log(`[scheduler] Closed spontaneous call ${activeSpontaneousCall.id} to make way for scheduled call`);
      }

      // Create Daily.co room with expiry matching call end time
      const roomUrl = await dailyVideo.createRoom(call.room_name, call.ends_at || undefined);

      // Update call status to active
      await prisma.callSession.update({
        where: { id: callId },
        data: { status: 'active', started_at: new Date(), room_url: roomUrl },
      });

      // Send push notifications to all non-muted group members
      const tokens = group.members
        .filter((member: any) => !member.is_muted)
        .flatMap((member: any) =>
          member.user.devices.map((device: any) => ({
            token: device.token,
            platform: device.platform,
          }))
        );

      if (tokens.length > 0) {
        await notifications.sendPushTokens(
          tokens,
          `${group.name} is calling!`,
          'Tap to join the scheduled call',
          {
            type: 'call_started',
            callId: callId,
            groupId: group.id,
            callType: 'scheduled',
            groupName: group.name,
            endsAt: call.ends_at?.toISOString() ?? '',
          }
        );
      }

      console.log(`[scheduler] Activated scheduled call ${callId} for group ${group.name}`);
    } catch (error) {
      console.error(`[scheduler] Error activating call ${callId}:`, error);
      throw error;
    }
  },

  /**
   * Close calls that have exceeded their duration
   * Only closes scheduled calls - spontaneous calls are closed when all participants leave
   */
  async closeExpiredCalls() {
    const now = new Date();

    try {
      // Find all active SCHEDULED calls that ended more than 15 seconds ago.
      // The 15s grace period lets clients leave via their countdown timer before
      // the room is deleted, avoiding the "room was deleted" error.
      const gracePeriodMs = 5 * 1000;
      const cutoff = new Date(now.getTime() - gracePeriodMs);
      const expiredCalls = await prisma.callSession.findMany({
        where: {
          status: 'active',
          call_type: 'scheduled',
          ends_at: {
            lte: cutoff
          }
        }
      });

      for (const call of expiredCalls) {
        await this.closeCall(call.id);
      }

      if (expiredCalls.length > 0) {
        console.log(`[scheduler] Closed ${expiredCalls.length} expired scheduled calls`);
      }
    } catch (error) {
      console.error('[scheduler] Error closing expired calls:', error);
    }
  },

  /**
   * Mark disconnected participants as left and close empty spontaneous calls.
   * Client beats every 10s; a participant is stale after 90s with no heartbeat
   * (or 90s after join_at if no heartbeat was ever received).
   */
  async pruneStaleParticipants() {
    const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);

    try {
      const stale = await prisma.callParticipant.findMany({
        where: {
          left_at: null,
          OR: [
            { last_seen_at: { lt: cutoff } },
            { last_seen_at: null, joined_at: { lt: cutoff } },
          ],
          call: { status: 'active' },
        },
        include: { call: true },
      });

      for (const participant of stale) {
        await prisma.callParticipant.update({
          where: { id: participant.id },
          data: { left_at: new Date() },
        });

        console.log(`[scheduler] Pruned stale participant ${participant.user_id} from call ${participant.call_id}`);

        if (participant.call.call_type === 'spontaneous') {
          const remaining = await prisma.callParticipant.count({
            where: { call_id: participant.call_id, left_at: null },
          });

          if (remaining === 0) {
            const presence = participant.call.room_name
              ? await dailyVideo.getRoomPresenceCount(participant.call.room_name)
              : null;

            if (presence !== null && presence > 0) {
              console.warn(
                `[scheduler] Call ${participant.call_id} looks empty in DB but Daily reports ` +
                `${presence} connected participant(s) — skipping close (will re-check next sweep)`
              );
              continue;
            }

            await this.closeCall(participant.call_id);
            console.log(`[scheduler] Closed empty spontaneous call ${participant.call_id}`);
          }
        }
      }
    } catch (error) {
      console.error('[scheduler] Error pruning stale participants:', error);
    }
  },

  /**
   * Close a specific call session
   */
  async closeCall(callId: string) {
    try {
      const call = await prisma.callSession.findUnique({
        where: { id: callId }
      });

      if (!call) {
        console.error(`[scheduler] Call ${callId} not found`);
        return;
      }

      // Best-effort room deletion — don't let a Daily.co failure prevent the
      // call from being marked ended in the DB.
      if (call.room_name) {
        try {
          await dailyVideo.deleteRoom(call.room_name);
        } catch (roomErr) {
          console.error(`[scheduler] Failed to delete Daily.co room for call ${callId} (continuing):`, roomErr);
        }
      }

      // Update call status to ended
      await prisma.callSession.update({
        where: { id: callId },
        data: {
          status: 'ended',
          ended_at: new Date()
        }
      });

      // Notify all group members to dismiss Live Activities / ongoing notifications
      const groupWithDevices = await prisma.group.findUnique({
        where: { id: call.group_id },
        include: { members: { include: { user: { include: { devices: true } } } } }
      });
      if (groupWithDevices) {
        const allTokens = groupWithDevices.members.flatMap((m: any) =>
          m.user.devices.map((d: any) => ({ token: d.token, platform: d.platform as 'ios' | 'android' }))
        );
        if (allTokens.length > 0) {
          await notifications.sendSilentPushTokens(allTokens, {
            type: 'call_ended',
            callId,
            groupId: call.group_id,
          });
        }
      }

      console.log(`[scheduler] Closed call ${callId}`);
    } catch (error) {
      console.error(`[scheduler] Error closing call ${callId}:`, error);
    }
  }
};
