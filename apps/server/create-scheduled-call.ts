import { config } from 'dotenv';
config({ override: true });
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createScheduledCall() {
  try {
    const groupId = '32d64fba-bbd8-4c72-880a-6363aa958e09';
    const scheduledAt = new Date('2026-03-12T02:42:56.000Z');

    // Get the group
    const group = await prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      console.error('Group not found');
      process.exit(1);
    }

    console.log(`Found group: ${group.name}`);
    console.log(`Scheduled time: ${scheduledAt.toISOString()}`);

    // Calculate ends_at
    const endsAt = new Date(scheduledAt.getTime() + group.call_duration_minutes * 60 * 1000);
    console.log(`Ends at: ${endsAt.toISOString()}`);

    // Create room name
    const roomName = `${groupId}_${scheduledAt.toISOString().replace(/[:.]/g, '-')}`;

    // Create the scheduled call
    const call = await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: scheduledAt,
        ends_at: endsAt,
        room_name: roomName
      }
    });

    console.log('\n✅ Successfully created scheduled call!');
    console.log(`Call ID: ${call.id}`);
    console.log(`Group: ${group.name}`);
    console.log(`Status: ${call.status}`);
    console.log(`Scheduled at: ${call.scheduled_at?.toISOString()}`);
    console.log(`Ends at: ${call.ends_at?.toISOString()}`);
    console.log(`Room name: ${call.room_name}`);

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createScheduledCall();
