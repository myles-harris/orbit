/**
 * Script to add a scheduled call for testing
 * Usage: node add-scheduled-call.js <phone_number> <group_name> <scheduled_time_iso>
 * Example: node add-scheduled-call.js "+15551234567" "Test" "2026-03-11T22:00:00.000Z"
 */

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function addScheduledCall() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);

    if (args.length < 3) {
      console.log('Usage: node add-scheduled-call.js <phone_number> <group_name> <scheduled_time_iso>');
      console.log('Example: node add-scheduled-call.js "+15551234567" "Test" "2026-03-11T22:00:00.000Z"');
      process.exit(1);
    }

    const [phoneNumber, groupName, scheduledTimeStr] = args;

    // Find user by phone number
    const user = await prisma.user.findUnique({
      where: { phone: phoneNumber }
    });

    if (!user) {
      console.error(`User with phone number ${phoneNumber} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.username} (${user.id})`);

    // Find group by name
    const group = await prisma.group.findFirst({
      where: { name: groupName }
    });

    if (!group) {
      console.error(`Group "${groupName}" not found`);
      process.exit(1);
    }

    console.log(`Found group: ${group.name} (${group.id})`);

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        group_id: group.id,
        user_id: user.id
      }
    });

    if (!membership) {
      console.error(`User ${user.username} is not a member of group "${groupName}"`);
      process.exit(1);
    }

    console.log(`User is a member of the group`);

    // Parse scheduled time
    const scheduledTime = new Date(scheduledTimeStr);
    if (isNaN(scheduledTime.getTime())) {
      console.error(`Invalid scheduled time: ${scheduledTimeStr}`);
      console.error('Use ISO 8601 format, e.g., "2026-03-11T22:00:00.000Z"');
      process.exit(1);
    }

    console.log(`Scheduled time: ${scheduledTime.toISOString()}`);

    // Calculate ends_at
    const endsAt = new Date(scheduledTime.getTime() + group.call_duration_minutes * 60 * 1000);
    console.log(`Ends at: ${endsAt.toISOString()}`);

    // Create the scheduled call
    const call = await prisma.callSession.create({
      data: {
        group_id: group.id,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: scheduledTime,
        ends_at: endsAt
      }
    });

    console.log('\n✅ Successfully created scheduled call!');
    console.log(`Call ID: ${call.id}`);
    console.log(`Group: ${group.name}`);
    console.log(`Status: ${call.status}`);
    console.log(`Scheduled at: ${call.scheduled_at?.toISOString()}`);
    console.log(`Ends at: ${call.ends_at?.toISOString()}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addScheduledCall();
