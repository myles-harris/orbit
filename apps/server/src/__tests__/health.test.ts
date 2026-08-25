import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../db/prisma.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: true });
  });

  it('returns 503 when the database is unreachable', async () => {
    const spy = jest.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: false });
    spy.mockRestore();
  });
});
