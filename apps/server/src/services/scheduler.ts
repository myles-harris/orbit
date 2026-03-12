import { PrismaClient, Cadence, CallStatus } from '@prisma/client';
import { dailyVideo } from './dailyVideo.js';
import { notifications } from './notifications.js';

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
   * Generate scheduled calls for a specific group
   */
  async generateCallsForGroup(groupId: string, cadence: Cadence, weeklyFrequency: number | null) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const endOfPeriod = new Date(tomorrow);

    if (cadence === 'daily') {
      // For daily cadence, schedule one call for tomorrow
      endOfPeriod.setDate(endOfPeriod.getDate() + 1);

      // Check if we already have a scheduled call for tomorrow
      const existingCall = await prisma.callSession.findFirst({
        where: {
          group_id: groupId,
          status: 'scheduled',
          scheduled_at: {
            gte: tomorrow,
            lt: endOfPeriod
          }
        }
      });

      if (!existingCall) {
        const randomTime = this.getRandomTime(tomorrow, endOfPeriod);
        await this.createScheduledCall(groupId, randomTime);
        console.log(`[scheduler] Scheduled daily call for group ${groupId} at ${randomTime.toISOString()}`);
      }
    } else if (cadence === 'weekly') {
      // For weekly cadence, schedule N calls for the next 7 days
      endOfPeriod.setDate(endOfPeriod.getDate() + 7);

      const frequency = weeklyFrequency || 1;

      // Check how many calls are already scheduled for the next week
      const existingCalls = await prisma.callSession.count({
        where: {
          group_id: groupId,
          status: 'scheduled',
          scheduled_at: {
            gte: tomorrow,
            lt: endOfPeriod
          }
        }
      });

      const callsToCreate = frequency - existingCalls;

      if (callsToCreate > 0) {
        // Generate random times for the week and select N of them
        const randomTimes = this.getRandomTimesForWeek(tomorrow, callsToCreate);

        for (const time of randomTimes) {
          await this.createScheduledCall(groupId, time);
        }

        console.log(`[scheduler] Scheduled ${callsToCreate} weekly calls for group ${groupId}`);
      }
    }
  },

  /**
   * Get a random time between start and end dates
   */
  getRandomTime(start: Date, end: Date): Date {
    const startTime = start.getTime();
    const endTime = end.getTime();
    const randomTime = startTime + Math.random() * (endTime - startTime);
    return new Date(randomTime);
  },

  /**
   * Get N random times spread across the week
   * Ensures no two calls are on the same day
   */
  getRandomTimesForWeek(startOfWeek: Date, count: number): Date[] {
    const times: Date[] = [];
    const usedDays = new Set<number>();

    // Generate array of available days (0-6)
    const availableDays = Array.from({ length: 7 }, (_, i) => i);

    // Shuffle and select first N days
    const shuffled = availableDays.sort(() => Math.random() - 0.5);
    const selectedDays = shuffled.slice(0, Math.min(count, 7));

    for (const dayOffset of selectedDays) {
      const dayStart = new Date(startOfWeek);
      dayStart.setDate(dayStart.getDate() + dayOffset);
      dayStart.setHours(8, 0, 0, 0); // Start at 8 AM

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(22, 0, 0, 0); // End at 10 PM

      times.push(this.getRandomTime(dayStart, dayEnd));
    }

    return times.sort((a, b) => a.getTime() - b.getTime());
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

    // Replace invalid characters (: and .) with valid ones for Daily.co room names
    const roomName = `${groupId}_${scheduledAt.toISOString().replace(/[:.]/g, '-')}`;

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
      // Find all scheduled calls that are due and haven't expired yet
      const dueCalls = await prisma.callSession.findMany({
        where: {
          status: 'scheduled',
          scheduled_at: {
            lte: now
          },
          ends_at: {
            gt: now
          }
        },
        include: {
          group: {
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      devices: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      for (const call of dueCalls) {
        await this.activateCall(call.id, call.group);
      }

      if (dueCalls.length > 0) {
        console.log(`[scheduler] Activated ${dueCalls.length} calls`);
      }
    } catch (error) {
      console.error('[scheduler] Error activating due calls:', error);
    }
  },

  /**
   * Activate a specific call session
   */
  async activateCall(callId: string, group: any) {
    try {
      const call = await prisma.callSession.findUnique({
        where: { id: callId }
      });

      if (!call || !call.room_name) {
        console.error(`[scheduler] Call ${callId} not found or missing room name`);
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
          call_type: 'spontaneous'
        }
      });

      if (activeSpontaneousCall) {
        // Close the spontaneous call
        await prisma.callSession.update({
          where: { id: activeSpontaneousCall.id },
          data: {
            status: 'ended',
            ended_at: new Date()
          }
        });

        // Delete the Daily.co room
        if (activeSpontaneousCall.room_name) {
          await dailyVideo.deleteRoom(activeSpontaneousCall.room_name);
        }

        console.log(`[scheduler] Closed spontaneous call ${activeSpontaneousCall.id} to make way for scheduled call`);
      }

      // Create Daily.co room with expiry matching call end time
      const roomUrl = await dailyVideo.createRoom(call.room_name, call.ends_at || undefined);

      // Update call status to active
      await prisma.callSession.update({
        where: { id: callId },
        data: {
          status: 'active',
          started_at: new Date(),
          room_url: roomUrl
        }
      });

      // Send push notifications to all group members
      const tokens = group.members.flatMap((member: any) =>
        member.user.devices.map((device: any) => ({
          token: device.token,
          platform: device.platform
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
            groupId: group.id
          }
        );
      }

      console.log(`[scheduler] Activated scheduled call ${callId} for group ${group.name}`);
    } catch (error) {
      console.error(`[scheduler] Error activating call ${callId}:`, error);
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

      // Delete the Daily.co room — this kicks all participants out immediately
      if (call.room_name) {
        await dailyVideo.deleteRoom(call.room_name);
      }

      // Update call status to ended
      await prisma.callSession.update({
        where: { id: callId },
        data: {
          status: 'ended',
          ended_at: new Date()
        }
      });

      console.log(`[scheduler] Closed call ${callId}`);
    } catch (error) {
      console.error(`[scheduler] Error closing call ${callId}:`, error);
    }
  }
};
