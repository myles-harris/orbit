import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../app.js';
import { createTestUserWithToken } from './helpers/auth.js';
import { calendarDateInTz, addDays, wallTimeToUtc } from '../util/scheduleTime.js';

const prisma = new PrismaClient();

describe('POST /groups', () => {
  it('creates a group and returns 201', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Morning Crew', cadence: 'daily', call_duration_minutes: 5 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Morning Crew');
    expect(res.body.id).toBeDefined();
    expect(res.body.member_count).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/groups')
      .send({ name: 'Test', cadence: 'daily', call_duration_minutes: 5 });

    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Incomplete' }); // missing cadence and call_duration_minutes

    expect(res.status).toBe(400);
  });
});

describe('GET /groups', () => {
  it('returns empty list for a new user', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
  });

  it('returns groups the user belongs to', async () => {
    const { token } = await createTestUserWithToken();

    await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Book Club', cadence: 'weekly', weekly_frequency: 2, call_duration_minutes: 30 });

    const res = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].name).toBe('Book Club');
  });

  it('does not return groups the user has not joined', async () => {
    const { token: ownerToken } = await createTestUserWithToken();
    const { token: otherToken } = await createTestUserWithToken();

    await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private Group', cadence: 'daily', call_duration_minutes: 5 });

    const res = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(0);
  });
});

describe('GET /groups/:id', () => {
  it('returns group details for a member', async () => {
    const { token } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Detail Group', cadence: 'daily', call_duration_minutes: 10 });

    const res = await request(app)
      .get(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Detail Group');
    expect(res.body.members).toHaveLength(1);
  });

  // T8 — the call-window preview shows the window as each member's zone sees it,
  // so the client needs every member's time_zone, not just the group's.
  it('returns each member\'s time_zone', async () => {
    const { user: owner, token } = await createTestUserWithToken();
    const { user: member } = await createTestUserWithToken();
    await prisma.user.update({ where: { id: owner.id }, data: { time_zone: 'America/New_York' } });
    await prisma.user.update({ where: { id: member.id }, data: { time_zone: 'Asia/Tokyo' } });

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zones Group', cadence: 'daily', call_duration_minutes: 10 });
    await prisma.groupMember.create({
      data: { group_id: createRes.body.id, user_id: member.id, role: 'member' },
    });

    const res = await request(app)
      .get(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const zoneByUser = Object.fromEntries(res.body.members.map((m: any) => [m.user_id, m.time_zone]));
    expect(zoneByUser).toEqual({
      [owner.id]: 'America/New_York',
      [member.id]: 'Asia/Tokyo',
    });
  });

  it('returns 404 for a non-existent group', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .get('/groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  // The invite preview hands the group id to anyone holding a code, so an id alone
  // must not be enough to read a roster. 404, not 403 — a 403 would confirm the id
  // belongs to a real group — and byte-for-byte what an unknown id gets.
  it('returns 404 to a user who is not a member, indistinguishable from an unknown id', async () => {
    const { token: ownerToken } = await createTestUserWithToken();
    const { token: outsiderToken } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private Group', cadence: 'daily', call_duration_minutes: 10 });

    const asOutsider = await request(app)
      .get(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    const unknownId = await request(app)
      .get('/groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(asOutsider.status).toBe(404);
    expect(asOutsider.body).toEqual(unknownId.body);
    // Nothing about the group or its members leaks in the body.
    expect(JSON.stringify(asOutsider.body)).not.toMatch(/Private Group|username|time_zone/);
  });

  it('stops serving a user once they have been removed from the group', async () => {
    const { token: ownerToken } = await createTestUserWithToken();
    const { user: member, token: memberToken } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Leaving Group', cadence: 'daily', call_duration_minutes: 10 });
    const membership = await prisma.groupMember.create({
      data: { group_id: createRes.body.id, user_id: member.id, role: 'member' },
    });

    const before = await request(app).get(`/groups/${createRes.body.id}`).set('Authorization', `Bearer ${memberToken}`);
    expect(before.status).toBe(200);

    await prisma.groupMember.delete({ where: { id: membership.id } });
    const after = await request(app).get(`/groups/${createRes.body.id}`).set('Authorization', `Bearer ${memberToken}`);
    expect(after.status).toBe(404);
  });
});

describe('DELETE /groups/:id', () => {
  it('allows the owner to delete the group', async () => {
    const { token } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Temp Group', cadence: 'daily', call_duration_minutes: 5 });

    const res = await request(app)
      .delete(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('returns 403 when a non-owner tries to delete', async () => {
    const { token: ownerToken } = await createTestUserWithToken();
    const { token: otherToken } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Owner Group', cadence: 'daily', call_duration_minutes: 5 });

    const res = await request(app)
      .delete(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});

describe('WS-9: PUT /groups/:id settings change (9c)', () => {
  it('does not cancel a call scheduled for later today when owner updates duration', async () => {
    const { token } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Timing Group', cadence: 'daily', call_duration_minutes: 30 });

    const groupId = createRes.body.id;

    // Seed a call for later today in UTC (test users are created with time_zone: 'UTC',
    // so the server computes tomorrowStart in UTC — laterToday must be in the same timezone)
    const todayUTC = calendarDateInTz(new Date(), 'UTC');
    const laterToday = wallTimeToUtc(todayUTC.year, todayUTC.monthIndex, todayUTC.day, 21 * 60, 'UTC'); // 9pm UTC

    if (laterToday > new Date()) {
      await prisma.callSession.create({
        data: {
          group_id: groupId,
          status: 'scheduled',
          call_type: 'scheduled',
          scheduled_at: laterToday,
          ends_at: new Date(laterToday.getTime() + 30 * 60_000),
          room_name: 'today-room',
        },
      });

      const putRes = await request(app)
        .put(`/groups/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ call_duration_minutes: 45 });

      expect(putRes.status).toBe(200);

      const todayCall = await prisma.callSession.findFirst({
        where: { group_id: groupId, scheduled_at: laterToday },
      });
      expect(todayCall!.status).toBe('scheduled');
    }
  });

  it('cancels calls from tomorrow onward when owner updates cadence', async () => {
    const { token } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Future Group', cadence: 'daily', call_duration_minutes: 30 });

    const groupId = createRes.body.id;

    // Seed a call for two days from now
    const todayPT = calendarDateInTz(new Date());
    const twoDaysOut = addDays(todayPT, 2);
    const futureTime = wallTimeToUtc(twoDaysOut.year, twoDaysOut.monthIndex, twoDaysOut.day, 9 * 60);

    await prisma.callSession.create({
      data: {
        group_id: groupId,
        status: 'scheduled',
        call_type: 'scheduled',
        scheduled_at: futureTime,
        ends_at: new Date(futureTime.getTime() + 30 * 60_000),
        room_name: 'future-room',
      },
    });

    const putRes = await request(app)
      .put(`/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cadence: 'weekly', weekly_frequency: 1 });

    expect(putRes.status).toBe(200);

    const futureCall = await prisma.callSession.findFirst({
      where: { group_id: groupId, scheduled_at: futureTime },
    });
    expect(futureCall!.status).toBe('ended');
  });

  it('PATCH /groups/:id is gone (9f)', async () => {
    const { token } = await createTestUserWithToken();

    const createRes = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Patch Test', cadence: 'daily', call_duration_minutes: 5 });

    const res = await request(app)
      .patch(`/groups/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ call_duration_minutes: 60 });

    expect(res.status).toBe(404);
  });
});
