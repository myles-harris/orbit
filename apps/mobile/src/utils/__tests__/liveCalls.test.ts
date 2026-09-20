import type { GroupDTO } from '@orbit/shared';
import { fetchLiveCalls, pickHeroCall, type LiveCall } from '../liveCalls';

const group = (id: string, call_duration_minutes: number): GroupDTO =>
  ({ id, name: id, call_duration_minutes }) as GroupDTO;

const call = (id: string, group_id: string, ends_at: string): LiveCall => ({
  id, group_id, ends_at, participant_count: 1,
});

describe('pickHeroCall', () => {
  it('returns null when nothing is live', () => {
    expect(pickHeroCall([], [group('a', 10)])).toBeNull();
  });

  it('picks the most recently started call, derived as ends_at minus the call length', () => {
    // A ends later but is a 30-minute call that started at 11:45; B is a 5-minute
    // call that started at 12:05 — so B is the more recent, despite ending sooner.
    const a = call('ca', 'a', '2026-09-19T12:15:00Z');
    const b = call('cb', 'b', '2026-09-19T12:10:00Z');
    const groups = [group('a', 30), group('b', 5)];

    expect(pickHeroCall([a, b], groups)).toBe(b);
    expect(pickHeroCall([b, a], groups)).toBe(b);
  });

  it('keeps the server order on a tie', () => {
    const a = call('ca', 'a', '2026-09-19T12:10:00Z');
    const b = call('cb', 'b', '2026-09-19T12:10:00Z');
    const groups = [group('a', 10), group('b', 10)];

    expect(pickHeroCall([a, b], groups)).toBe(a);
    expect(pickHeroCall([b, a], groups)).toBe(b);
  });
});

describe('fetchLiveCalls stub', () => {
  const original = process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
    else process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = original;
  });

  const groups = [group('a', 10), group('b', 10), group('c', 10)];

  it('reports no live calls by default, so no live card renders', async () => {
    delete process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
    await expect(fetchLiveCalls(groups)).resolves.toEqual([]);
  });

  it('fakes the first n groups as live when the dev flag is set, most recent first', async () => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = '2';
    const calls = await fetchLiveCalls(groups);

    expect(calls.map((c) => c.group_id)).toEqual(['a', 'b']);
    expect(calls.every((c) => new Date(c.ends_at).getTime() > Date.now())).toBe(true);
    // Same shape the real endpoint will return.
    expect(Object.keys(calls[0]).sort()).toEqual(['ends_at', 'group_id', 'id', 'participant_count']);
    expect(pickHeroCall(calls, groups)).toBe(calls[0]);
  });
});
