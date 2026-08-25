/**
 * Unit test for the A7 timeout fix: sendApnsRaw must not hang forever on a stream
 * that Apple accepts but never responds to. Exercises the real http2 client against
 * a local http2 server (no TLS — h2c) that accepts every stream and never replies,
 * standing in for a hung APNs connection.
 */
import http2 from 'node:http2';
import { generateKeyPairSync } from 'node:crypto';

describe('sendApnsRaw timeout [A7]', () => {
  let server: http2.Http2Server;
  let port: number;

  beforeAll(async () => {
    server = http2.createServer((_req, _res) => {
      // Deliberately never call res.end() / res.write() — simulates a hung stream.
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    delete process.env.APNS_TIMEOUT_MS;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_KEY_CONTENT;
  });

  it('resolves {ok:false, reason:"timeout"} within APNS_TIMEOUT_MS + 500 instead of hanging', async () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    process.env.APNS_TIMEOUT_MS = '300';
    process.env.APNS_KEY_ID = 'test-key-id';
    process.env.APNS_TEAM_ID = 'test-team-id';
    process.env.APNS_KEY_CONTENT = privateKey as string;
    jest.resetModules();

    // apns.ts connects to Apple's real host; redirect it to the local h2c server
    // that never responds, regardless of the authority it was asked to connect to.
    jest.spyOn(http2, 'connect').mockImplementation(() => http2.connect(`http://localhost:${port}`));

    const { sendApnsRaw } = await import('../services/apns.js');

    const start = Date.now();
    const result = await sendApnsRaw('fake-device-token', { aps: {} }, { pushType: 'alert' });

    expect(Date.now() - start).toBeLessThan(800);
    expect(result).toEqual({ ok: false, status: 0, reason: 'timeout' });
  });
});
