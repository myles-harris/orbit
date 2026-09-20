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

// ─── Group photos ─────────────────────────────────────────────────────────────

/** Minimal structurally-valid JPEG: SOI + APP0/JFIF header, padded to `bytes`. */
const jpegOfSize = (bytes: number) => {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length), 0xab)]);
};

// 1x1 PNG in base64 (smallest valid PNG)
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function groupWithPeople() {
  const owner = await createTestUserWithToken();
  const member = await createTestUserWithToken();
  const outsider = await createTestUserWithToken();
  const created = await request(app)
    .post('/groups')
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ name: 'Photo Group', cadence: 'daily', call_duration_minutes: 5 });
  const groupId: string = created.body.id;
  await prisma.groupMember.create({ data: { group_id: groupId, user_id: member.user.id, role: 'member' } });
  return { groupId, owner, member, outsider };
}

const putPhoto = (groupId: string, token: string, buf: Buffer, mime = 'image/jpeg') =>
  request(app)
    .put(`/groups/${groupId}/photo`)
    .set('Authorization', `Bearer ${token}`)
    .send({ data: buf.toString('base64'), mime_type: mime });

const getPhoto = (groupId: string, token: string, query = '') =>
  request(app).get(`/groups/${groupId}/photo${query}`).set('Authorization', `Bearer ${token}`);

const getGroup = (groupId: string, token: string) =>
  request(app).get(`/groups/${groupId}`).set('Authorization', `Bearer ${token}`);

describe('group photo', () => {
  // T10
  describe('PUT /groups/:id/photo', () => {
    it('lets the owner set it', async () => {
      const { groupId, owner } = await groupWithPeople();

      const res = await putPhoto(groupId, owner.token, jpegOfSize(4096));

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.photo_updated_at).toEqual(expect.any(String));
      const detail = await getGroup(groupId, owner.token);
      expect(detail.body.has_photo).toBe(true);
      expect(detail.body.photo_updated_at).toBe(res.body.photo_updated_at);
    });

    it('refuses a member with 403 and stores nothing', async () => {
      const { groupId, owner, member } = await groupWithPeople();

      const res = await putPhoto(groupId, member.token, jpegOfSize(4096));

      expect(res.status).toBe(403);
      expect((await getGroup(groupId, owner.token)).body.has_photo).toBe(false);
    });

    it('answers a non-member 404, the same as for an id that does not exist', async () => {
      const { groupId, outsider } = await groupWithPeople();

      const real = await putPhoto(groupId, outsider.token, jpegOfSize(4096));
      const unknown = await putPhoto('no-such-group', outsider.token, jpegOfSize(4096));

      expect(real.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(real.body).toEqual(unknown.body);
    });

    it('requires auth', async () => {
      const { groupId } = await groupWithPeople();
      const res = await request(app)
        .put(`/groups/${groupId}/photo`)
        .send({ data: jpegOfSize(64).toString('base64'), mime_type: 'image/jpeg' });
      expect(res.status).toBe(401);
    });

    it('replaces an existing photo and moves its version stamp', async () => {
      const { groupId, owner } = await groupWithPeople();
      const first = await putPhoto(groupId, owner.token, jpegOfSize(2048));
      await new Promise((r) => setTimeout(r, 5)); // distinct millisecond, so the ETag must differ
      const second = await putPhoto(groupId, owner.token, jpegOfSize(4096));

      expect(second.status).toBe(200);
      expect(second.body.photo_updated_at).not.toBe(first.body.photo_updated_at);
      const served = await getPhoto(groupId, owner.token);
      expect(served.body.length).toBe(4096);
    });
  });

  describe('DELETE /groups/:id/photo', () => {
    it('lets the owner remove it, after which the photo route 404s', async () => {
      const { groupId, owner } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));

      const res = await request(app).delete(`/groups/${groupId}/photo`).set('Authorization', `Bearer ${owner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const detail = await getGroup(groupId, owner.token);
      expect(detail.body.has_photo).toBe(false);
      expect(detail.body.photo_updated_at).toBeNull();
      expect((await getPhoto(groupId, owner.token)).status).toBe(404);
    });

    it('refuses a member with 403 and leaves the photo', async () => {
      const { groupId, owner, member } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));

      const res = await request(app).delete(`/groups/${groupId}/photo`).set('Authorization', `Bearer ${member.token}`);

      expect(res.status).toBe(403);
      expect((await getGroup(groupId, owner.token)).body.has_photo).toBe(true);
    });

    it('answers a non-member 404 and leaves the photo', async () => {
      const { groupId, owner, outsider } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));

      const res = await request(app).delete(`/groups/${groupId}/photo`).set('Authorization', `Bearer ${outsider.token}`);

      expect(res.status).toBe(404);
      expect((await getGroup(groupId, owner.token)).body.has_photo).toBe(true);
    });
  });

  // T11
  describe('GET /groups/:id/photo', () => {
    it('serves the photo to a member as a non-empty image/jpeg', async () => {
      const { groupId, owner, member } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));

      const res = await getPhoto(groupId, member.token);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.length).toBe(4096);
    });

    it('answers a non-member 404, with no ETag or cache policy to learn from', async () => {
      const { groupId, owner, outsider } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));

      const res = await getPhoto(groupId, outsider.token);

      expect(res.status).toBe(404);
      expect(res.headers['etag']).toBeUndefined();
      expect(res.headers['cache-control']).toBeUndefined();
    });

    it('does not let a non-member confirm a photo by presenting its ETag', async () => {
      const { groupId, owner, outsider } = await groupWithPeople();
      const upload = await putPhoto(groupId, owner.token, jpegOfSize(4096));
      const etag = `"${new Date(upload.body.photo_updated_at).getTime()}"`;

      const res = await getPhoto(groupId, outsider.token).set('If-None-Match', etag);

      expect(res.status).toBe(404); // not 304: a 304 would say the photo exists and matches
    });

    it('answers 304 to a member presenting the current ETag', async () => {
      const { groupId, owner, member } = await groupWithPeople();
      const upload = await putPhoto(groupId, owner.token, jpegOfSize(4096));
      const version = new Date(upload.body.photo_updated_at).getTime();

      const first = await getPhoto(groupId, member.token, `?v=${version}`);
      expect(first.headers['etag']).toBe(`"${version}"`);

      const repeat = await getPhoto(groupId, member.token, `?v=${version}`).set('If-None-Match', first.headers['etag']);
      expect(repeat.status).toBe(304);
    });

    it('is immutable-cacheable only when versioned', async () => {
      const { groupId, owner } = await groupWithPeople();
      const upload = await putPhoto(groupId, owner.token, jpegOfSize(4096));
      const version = new Date(upload.body.photo_updated_at).getTime();

      const versioned = await getPhoto(groupId, owner.token, `?v=${version}`);
      const unversioned = await getPhoto(groupId, owner.token);

      expect(versioned.headers['cache-control']).toContain('immutable');
      expect(unversioned.headers['cache-control']).not.toContain('immutable');
    });

    it('404s when the group has no photo', async () => {
      const { groupId, owner } = await groupWithPeople();
      expect((await getPhoto(groupId, owner.token)).status).toBe(404);
    });

    it('stops serving a member who has been removed from the group', async () => {
      const { groupId, owner, member } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(4096));
      expect((await getPhoto(groupId, member.token)).status).toBe(200);

      await prisma.groupMember.deleteMany({ where: { group_id: groupId, user_id: member.user.id } });

      expect((await getPhoto(groupId, member.token)).status).toBe(404);
    });
  });

  // T12 — mirrors the avatar boundary tests in api.test.ts
  describe('upload validation', () => {
    it('rejects a PNG body declared as image/jpeg', async () => {
      const { groupId, owner } = await groupWithPeople();

      const res = await request(app)
        .put(`/groups/${groupId}/photo`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_image');
      expect((await getGroup(groupId, owner.token)).body.has_photo).toBe(false);
    });

    it('rejects a payload one byte over the 2 MB cap', async () => {
      const { groupId, owner } = await groupWithPeople();

      const res = await putPhoto(groupId, owner.token, jpegOfSize(2 * 1024 * 1024 + 1));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('photo_too_large');
    });

    it('accepts a payload of exactly 2 MB, and one just under', async () => {
      const { groupId, owner } = await groupWithPeople();
      expect((await putPhoto(groupId, owner.token, jpegOfSize(2 * 1024 * 1024))).status).toBe(200);
      expect((await putPhoto(groupId, owner.token, jpegOfSize(2 * 1024 * 1024 - 1))).status).toBe(200);
    });

    it('rejects an unsupported mime type', async () => {
      const { groupId, owner } = await groupWithPeople();

      const res = await request(app)
        .put(`/groups/${groupId}/photo`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ data: TINY_PNG_B64, mime_type: 'image/bmp' });

      expect(res.status).toBe(400);
    });

    it('rejects a body with no data', async () => {
      const { groupId, owner } = await groupWithPeople();
      const res = await request(app)
        .put(`/groups/${groupId}/photo`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ mime_type: 'image/jpeg' });
      expect(res.status).toBe(400);
    });
  });

  // T13 — the blob is served by GET /:id/photo and by nothing else
  describe('group payloads carry no blob', () => {
    it('GET /groups has_photo and a version stamp, and neither photo bytes nor a photo key', async () => {
      const { groupId, owner } = await groupWithPeople();
      const upload = await putPhoto(groupId, owner.token, jpegOfSize(300 * 1024));

      const res = await request(app).get('/groups').set('Authorization', `Bearer ${owner.token}`);

      expect(res.status).toBe(200);
      const group = res.body.groups.find((g: any) => g.id === groupId);
      expect(group.has_photo).toBe(true);
      expect(group.photo_updated_at).toBe(upload.body.photo_updated_at);
      expect(group).not.toHaveProperty('photo');
      expect(group).not.toHaveProperty('photo_mime_type');
      // A 300 KB photo leaking in any encoding would dwarf this.
      expect(JSON.stringify(res.body).length).toBeLessThan(5_000);
    });

    it('GET /groups/:id and PUT /groups/:id do not return the blob either', async () => {
      const { groupId, owner } = await groupWithPeople();
      await putPhoto(groupId, owner.token, jpegOfSize(300 * 1024));

      const detail = await getGroup(groupId, owner.token);
      const updated = await request(app)
        .put(`/groups/${groupId}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'Renamed' });

      for (const res of [detail, updated]) {
        expect(res.status).toBe(200);
        expect(res.body.has_photo).toBe(true);
        expect(res.body).not.toHaveProperty('photo');
        expect(JSON.stringify(res.body).length).toBeLessThan(5_000);
      }
    });

    it('a group with no photo reports has_photo false and a null stamp everywhere', async () => {
      const { owner } = await groupWithPeople();

      const created = await request(app)
        .post('/groups')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'Bare', cadence: 'daily', call_duration_minutes: 5 });
      const list = await request(app).get('/groups').set('Authorization', `Bearer ${owner.token}`);

      expect(created.body.has_photo).toBe(false);
      expect(created.body.photo_updated_at).toBeNull();
      for (const g of list.body.groups) {
        expect(g.has_photo).toBe(false);
        expect(g.photo_updated_at).toBeNull();
      }
    });
  });

  // T15 — the invariant is the database's, not just the routes'
  describe('group_photo_consistency', () => {
    it('rejects photo bytes without a version stamp', async () => {
      const { groupId } = await groupWithPeople();
      await expect(
        prisma.group.update({ where: { id: groupId }, data: { photo: jpegOfSize(64) } }),
      ).rejects.toThrow(/group_photo_consistency/);
    });

    it('rejects a version stamp without photo bytes', async () => {
      const { groupId } = await groupWithPeople();
      await expect(
        prisma.group.update({ where: { id: groupId }, data: { photo_updated_at: new Date() } }),
      ).rejects.toThrow(/group_photo_consistency/);
    });

    it('accepts bytes and stamp together, and clearing both', async () => {
      const { groupId } = await groupWithPeople();
      await expect(
        prisma.group.update({
          where: { id: groupId },
          data: { photo: jpegOfSize(64), photo_mime_type: 'image/jpeg', photo_updated_at: new Date() },
        }),
      ).resolves.toBeDefined();
      await expect(
        prisma.group.update({
          where: { id: groupId },
          data: { photo: null, photo_mime_type: null, photo_updated_at: null },
        }),
      ).resolves.toBeDefined();
    });
  });
});
