import { createAuthenticatedApiClient } from './apiClient';
import { formatCountdown, formatElapsed } from './countdown';

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
 * Whether a live call counts down: scheduled calls only. A spontaneous call has
 * nothing to count down to, and a countdown on it would be a lie. Every live
 * surface asks here rather than testing `ends_at` itself.
 *
 * What a surface does with "no" differs. Home's card draws no timer at all and its
 * Join pill takes the row. The Spotlight overlay keeps its 52pt timer slot and counts
 * *up* from `started_at` instead (`formatCallTimer`), because the card's composition
 * is built around that element.
 *
 * A scheduled call that somehow arrives without an `ends_at` degrades to "no
 * countdown" rather than being dropped.
 */
export function hasCountdown(call: LiveCall): call is LiveCall & { ends_at: string } {
  return call.call_type === 'scheduled' && call.ends_at !== null;
}

/**
 * A scheduled call with no end time is a data fault, not a state to render: the
 * server sets `ends_at` on every scheduled call. Callers log it and show elapsed
 * time, which `formatCallTimer` already does.
 */
export function isMissingEndTime(call: LiveCall): boolean {
  return call.call_type === 'scheduled' && call.ends_at === null;
}

/**
 * The timer string for a live call at `now`: time left for a scheduled call, time
 * since it started for any other. Branches on `call_type` (through `hasCountdown`),
 * not on `ends_at == null`, so a scheduled call that arrives without an end time
 * falls back to elapsed time instead of counting toward `null` and printing "NaN:NaN".
 *
 * A pure function of `now`, like the two formatters it picks between.
 */
export function formatCallTimer(call: LiveCall, now: number): string {
  return hasCountdown(call) ? formatCountdown(call.ends_at, now) : formatElapsed(call.started_at, now);
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
