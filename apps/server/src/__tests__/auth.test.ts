import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { createTestUser, createRefreshToken } from './helpers/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev';

describe('POST /auth/complete-signup', () => {
  it('creates a new user with a valid signup token', async () => {
    const phone = '+15551000001';
    const signupToken = jwt.sign({ type: 'signup', phone }, JWT_SECRET, { expiresIn: 600 });

    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: signupToken, username: 'newuser1' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('newuser1');
    expect(res.body.user.phone).toBe(phone);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  it('returns 409 when username is already taken', async () => {
    await createTestUser({ username: 'taken' });
    const signupToken = jwt.sign({ type: 'signup', phone: '+15552000002' }, JWT_SECRET, { expiresIn: 600 });

    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: signupToken, username: 'taken' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('username_taken');
  });

  it('returns 401 with an invalid signup token', async () => {
    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: 'not-a-valid-token', username: 'whoever' });

    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired signup token', async () => {
    const signupToken = jwt.sign({ type: 'signup', phone: '+15553000003' }, JWT_SECRET, { expiresIn: -1 });

    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: signupToken, username: 'expireduser' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when body is missing fields', async () => {
    const res = await request(app)
      .post('/auth/complete-signup')
      .send({ signup_token: 'something' }); // missing username

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh', () => {
  it('returns new tokens with a valid refresh token', async () => {
    const user = await createTestUser();
    const refreshToken = createRefreshToken(user.id);

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  it('returns 401 with an invalid refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: 'invalid' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user no longer exists', async () => {
    const refreshToken = createRefreshToken('00000000-0000-0000-0000-000000000000');

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
  });
});
