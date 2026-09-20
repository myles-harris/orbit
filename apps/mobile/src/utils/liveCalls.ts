import { GroupDTO } from '@orbit/shared';

export type CallType = 'scheduled' | 'spontaneous';

/**
 * The target shape of `GET /me/calls/active` once PR 6 extends it from `{ callIds }`
 * to `{ calls: LiveCall[] }` (00-CONTEXT.md, "Live call on Home"). Home is written
 * against this now so the component contract does not change when the endpoint does.
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
 * the Spotlight overlay when PR 6 builds it.
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
 * STUB until PR 6. `GET /groups` carries no live-call data and `/me/calls/active`
 * returns only ids, so there is nothing real to read yet — and per-group requests
 * to `/groups/:id/calls/current` are deliberately not a stopgap (a load pattern
 * someone would have to unpick). Resolves to no live calls, so no live card renders.
 *
 * To see the live card in a dev build, start Metro with
 * `EXPO_PUBLIC_STUB_LIVE_CALLS=<types>`, a comma list of `scheduled` and
 * `spontaneous`: the first group is faked as the first type, the second as the
 * second, and so on, most recently started first. `scheduled` shows the countdown,
 * `spontaneous` does not; `scheduled,spontaneous` shows the card and the
 * concurrent-live tile. `__DEV__` is false in release builds, so the fixture never
 * ships. Joining a fake call fails, because the call does not exist server-side.
 *
 * `groups` is only here to give the fixture ids to attach to. PR 6 replaces this
 * body with the real request and drops the parameter.
 */
export async function fetchLiveCalls(groups: GroupDTO[]): Promise<LiveCall[]> {
  const types = __DEV__ ? stubTypes(process.env.EXPO_PUBLIC_STUB_LIVE_CALLS) : [];
  const now = Date.now();
  return groups.slice(0, types.length).map((g, i) => ({
    id: `stub-call-${g.id}`,
    group_id: g.id,
    call_type: types[i],
    started_at: new Date(now - (2 + i * 3) * 60_000).toISOString(),
    ends_at: types[i] === 'scheduled' ? new Date(now + ((12 - i * 3) * 60 + 4) * 1000).toISOString() : null,
    participant_count: 1,
  }));
}

function stubTypes(raw: string | undefined): CallType[] {
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is CallType => part === 'scheduled' || part === 'spontaneous');
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
