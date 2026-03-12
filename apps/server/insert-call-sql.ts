import pg from 'pg';
const { Client } = pg;

async function insertScheduledCall() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const groupId = '32d64fba-bbd8-4c72-880a-6363aa958e09';
    const scheduledAt = new Date('2026-03-11T23:10:00.000Z');

    // First, get the group to get the call duration
    const groupResult = await client.query(
      'SELECT id, name, call_duration_minutes FROM "Group" WHERE id = $1',
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      console.error('Group not found');
      process.exit(1);
    }

    const group = groupResult.rows[0];
    console.log(`Found group: ${group.name}`);
    console.log(`Scheduled time: ${scheduledAt.toISOString()}`);

    // Calculate ends_at
    const endsAt = new Date(scheduledAt.getTime() + group.call_duration_minutes * 60 * 1000);
    console.log(`Ends at: ${endsAt.toISOString()}`);

    // Create room name
    const roomName = `${groupId}_${scheduledAt.toISOString().replace(/[:.]/g, '-')}`;

    // Insert the scheduled call
    const insertResult = await client.query(`
      INSERT INTO "CallSession" (id, group_id, status, call_type, scheduled_at, ends_at, room_name)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
      RETURNING id, status, scheduled_at, ends_at, room_name
    `, [groupId, 'scheduled', 'scheduled', scheduledAt, endsAt, roomName]);

    const call = insertResult.rows[0];

    console.log('\n✅ Successfully created scheduled call!');
    console.log(`Call ID: ${call.id}`);
    console.log(`Group: ${group.name}`);
    console.log(`Status: ${call.status}`);
    console.log(`Scheduled at: ${call.scheduled_at.toISOString()}`);
    console.log(`Ends at: ${call.ends_at.toISOString()}`);
    console.log(`Room name: ${call.room_name}`);

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

insertScheduledCall();
