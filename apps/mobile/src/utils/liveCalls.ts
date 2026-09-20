import { createAuthenticatedApiClient } from './apiClient';

type CallType = 'scheduled' | 'spontaneous';

/**
 * One entry of `GET /me/calls/active`'s `calls` (00-CONTEXT.md, "Live call on Home").
 *
 * Every call has a `started_at`. Only a scheduled call has an `ends_at`: a
 * spontaneous call has no fixed end and stays open until its last participant leaves
 * (routes/calls.ts), so its `ends_at` is always null.
 */
export interface LiveCall {
  id: string;
  group_id: string;
  call_type: CallType;
  started_at: string;
  ends_at: string | null;
  participant_count: number;
}

/**
 * Whether a live call shows a countdown: scheduled calls only. A spontaneous call
 * has nothing to count down to, and a countdown on it would be a lie. Every live
 * surface asks here rather than testing `ends_at` itself — Home's card today, and
 * the Spotlight overlay once it exists.
 *
 * A scheduled call that somehow arrives without an `ends_at` degrades to "no
 * countdown" rather than being dropped.
 */
export function hasCountdown(call: LiveCall): call is LiveCall & { ends_at: string } {
  return call.call_type === 'scheduled' && call.ends_at !== null;
}

/**
 * A call with a countdown is live until its end time. Any other stays live until
 * the server says it is over, which the client learns on its next load. An
 * unparseable end time counts as over.
 */
export function isLive(call: LiveCall, now: number): boolean {
  return hasCountdown(call) ? new Date(call.ends_at).getTime() > now : true;
}

/**
 * The calls live right now in any of the user's groups. One request for all of them:
 * `GET /groups` carries no live-call data, and a request per group would be a load
 * pattern someone would have to unpick.
 *
 * The response also carries `callIds`, the shape from before `calls` existed, which
 * old builds still read. Nothing here does.
 */
export async function fetchLiveCalls(): Promise<LiveCall[]> {
  const client = await createAuthenticatedApiClient();
  const { calls } = await client.get<{ calls?: LiveCall[] }>('/me/calls/active');
  // A server that has not shipped `calls` yet answers with `callIds` alone: no live
  // card, rather than a screen that crashes on `undefined.filter`.
  return calls ?? [];
}

/**
 * The hero card goes to the most recently started call; every other live group
 * keeps its tile. Ties keep the server's order. An unparseable `started_at` sorts
 * last.
 */
export function pickHeroCall(calls: LiveCall[]): LiveCall | null {
  const startedAt = (c: LiveCall) => {
    const ms = new Date(c.started_at).getTime();
    return Number.isNaN(ms) ? -Infinity : ms;
  };

  let hero: LiveCall | null = null;
  for (const call of calls) {
    if (!hero || startedAt(call) > startedAt(hero)) hero = call;
  }
  return hero;
}
