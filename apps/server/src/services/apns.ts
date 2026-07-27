import http2 from 'node:http2';
import jwt from 'jsonwebtoken';

const HOST = process.env.APNS_PRODUCTION === 'true'
  ? 'https://api.push.apple.com'
  : 'https://api.sandbox.push.apple.com';

const KEY_ID  = process.env.APNS_KEY_ID ?? '';
const TEAM_ID = process.env.APNS_TEAM_ID ?? '';
export const BUNDLE = process.env.APNS_BUNDLE_ID || 'com.mylesharris.orbit';
// Railway (and most secret dashboards) store multi-line PEM with literal \n.
const KEY = (process.env.APNS_KEY_CONTENT ?? '').replace(/\\n/g, '\n');

let cachedToken: { value: string; issuedAt: number } | null = null;

/** APNs provider JWT — valid 60 min; must not be regenerated more than once per 20 min. */
function providerToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 45 * 60) return cachedToken.value;
  const value = jwt.sign({ iss: TEAM_ID, iat: now }, KEY, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: KEY_ID },
  });
  cachedToken = { value, issuedAt: now };
  return value;
}

let client: http2.ClientHttp2Session | null = null;

function session(): http2.ClientHttp2Session {
  if (client && !client.closed && !client.destroyed) return client;
  client = http2.connect(HOST);
  client.on('error', (e) => {
    console.error('[apns] session error:', e.message);
    client = null;
  });
  client.on('close', () => { client = null; });
  return client;
}

export interface ApnsHeaders {
  pushType: 'alert' | 'background' | 'liveactivity' | 'voip';
  /** Defaults to BUNDLE. Live Activity pushes need the .push-type.liveactivity suffix. */
  topic?: string;
  priority?: 5 | 10;
  expiration?: number;
  collapseId?: string;
}

export interface ApnsResult { ok: boolean; status: number; reason?: string }

export async function sendApnsRaw(
  token: string,
  payload: unknown,
  h: ApnsHeaders,
): Promise<ApnsResult> {
  if (!KEY || !KEY_ID || !TEAM_ID) {
    return { ok: false, status: 0, reason: 'APNs credentials not configured' };
  }

  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload));
    let req: http2.ClientHttp2Stream;
    try {
      req = session().request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'authorization': `bearer ${providerToken()}`,
        'apns-push-type': h.pushType,
        'apns-topic': h.topic ?? BUNDLE,
        'apns-priority': String(h.priority ?? 10),
        ...(h.expiration != null ? { 'apns-expiration': String(h.expiration) } : {}),
        ...(h.collapseId ? { 'apns-collapse-id': h.collapseId } : {}),
        'content-type': 'application/json',
        'content-length': String(body.length),
      });
    } catch (e) {
      // Session may have died between the guard and the request; reset and surface the error.
      client = null;
      return resolve({ ok: false, status: 0, reason: String(e) });
    }

    let status = 0;
    let raw = '';
    req.on('response', (res) => { status = Number(res[':status']); });
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', () => {
      if (status === 200) return resolve({ ok: true, status });
      let reason: string | undefined;
      try { reason = JSON.parse(raw).reason; } catch { /* non-JSON body */ }
      resolve({ ok: false, status, reason });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, reason: String(e) }));
    req.end(body);
  });
}

/** True if APNs credentials are present and can be used. */
export function isApnsConfigured(): boolean {
  return !!(KEY && KEY_ID && TEAM_ID);
}
