import request from 'supertest';
import { app } from '../app.js';
import { createTestUserWithToken } from './helpers/auth.js';

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

  it('returns 404 for a non-existent group', async () => {
    const { token } = await createTestUserWithToken();

    const res = await request(app)
      .get('/groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
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
