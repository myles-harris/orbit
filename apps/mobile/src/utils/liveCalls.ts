import { GroupDTO } from '@orbit/shared';

/**
 * The target shape of `GET /me/calls/active` once PR 6 extends it from `{ callIds }`
 * to `{ calls: LiveCall[] }` (00-CONTEXT.md, "Live call on Home"). Home is written
 * against this now so the component contract does not change when the endpoint does.
 */
export interface LiveCall {
  id: string;
  group_id: string;
  ends_at: string;
  participant_count: number;
}

/**
 * STUB until PR 6. `GET /groups` carries no live-call data and `/me/calls/active`
 * returns only ids, so there is nothing real to read yet — and per-group requests
 * to `/groups/:id/calls/current` are deliberately not a stopgap (a load pattern
 * someone would have to unpick). Resolves to no live calls, so no live card renders.
 *
 * To see the live card in a dev build, start Metro with
 * `EXPO_PUBLIC_STUB_LIVE_CALLS=<n>`: the first `n` groups are faked as live,
 * `n = 1` for the hero card, `n = 2` to also see the concurrent-live tile.
 * `__DEV__` is false in release builds, so the fixture never ships. Joining a fake
 * call fails, because the call does not exist server-side.
 *
 * `groups` is only here to give the fixture ids to attach to. PR 6 replaces this
 * body with the real request and drops the parameter.
 */
export async function fetchLiveCalls(groups: GroupDTO[]): Promise<LiveCall[]> {
  const fake = __DEV__ ? Number(process.env.EXPO_PUBLIC_STUB_LIVE_CALLS) : 0;
  if (!(fake > 0)) return [];
  // Staggered so the first group reads as the most recently started.
  return groups.slice(0, fake).map((g, i) => ({
    id: `stub-call-${g.id}`,
    group_id: g.id,
    ends_at: new Date(Date.now() + ((12 - i * 3) * 60 + 4) * 1000).toISOString(),
    participant_count: 1,
  }));
}

/**
 * The hero card goes to the most recently started call; every other live group
 * keeps its tile. The target shape has no `started_at`, so it is derived as
 * `ends_at` minus the group's call length. Ties keep the server's order.
 */
export function pickHeroCall(calls: LiveCall[], groups: GroupDTO[]): LiveCall | null {
  const minutesByGroup = new Map(groups.map((g) => [g.id, g.call_duration_minutes]));
  const startedAt = (c: LiveCall) => new Date(c.ends_at).getTime() - (minutesByGroup.get(c.group_id) ?? 0) * 60_000;

  let hero: LiveCall | null = null;
  for (const call of calls) {
    if (!hero || startedAt(call) > startedAt(hero)) hero = call;
  }
  return hero;
}
