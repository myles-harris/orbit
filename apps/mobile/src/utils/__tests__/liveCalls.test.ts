import type { GroupDTO } from '@orbit/shared';
import { fetchLiveCalls, hasCountdown, isLive, pickHeroCall, type CallType, type LiveCall } from '../liveCalls';

const group = (id: string, call_duration_minutes = 10): GroupDTO =>
  ({ id, name: id, call_duration_minutes }) as GroupDTO;

const T0 = Date.parse('2026-09-19T12:00:00.000Z');

const call = (over: Partial<LiveCall> & { id: string }): LiveCall => ({
  group_id: 'a',
  call_type: 'scheduled',
  started_at: '2026-09-19T12:00:00Z',
  ends_at: '2026-09-19T12:10:00Z',
  participant_count: 1,
  ...over,
});

const scheduled = (id: string, over: Partial<LiveCall> = {}) => call({ id, call_type: 'scheduled', ...over });
const spontaneous = (id: string, over: Partial<LiveCall> = {}) =>
  call({ id, call_type: 'spontaneous', ends_at: null, ...over });

// Only scheduled calls count down. This is the rule every live surface asks — Home's
// card now, the Spotlight overlay in PR 6 — so it is pinned here, once.
describe('hasCountdown', () => {
  it('is true for a scheduled call with an end time', () => {
    expect(hasCountdown(scheduled('c'))).toBe(true);
  });

  it('is false for a spontaneous call, which has no end time to count toward', () => {
    expect(hasCountdown(spontaneous('c'))).toBe(false);
  });

  it('is decided by the call type, not by whether an end time happens to be present', () => {
    // The server never sets one on a spontaneous call, but the rule is "scheduled
    // only" — an end time on the wrong type must not bring a countdown back.
    expect(hasCountdown(spontaneous('c', { ends_at: '2026-09-19T12:10:00Z' }))).toBe(false);
  });

  it('is false for a scheduled call that arrives without an end time, rather than crashing', () => {
    expect(hasCountdown(scheduled('c', { ends_at: null }))).toBe(false);
  });
});

describe('isLive', () => {
  const endsAt = T0 + 60_000;
  const withEnd = scheduled('s', { ends_at: new Date(endsAt).toISOString() });

  it('keeps a scheduled call live until its end time, and not after', () => {
    expect(isLive(withEnd, T0)).toBe(true);
    expect(isLive(withEnd, endsAt - 1)).toBe(true);
    expect(isLive(withEnd, endsAt)).toBe(false);
    expect(isLive(withEnd, endsAt + 1)).toBe(false);
  });

  it('never expires a spontaneous call on the client — only the server ends it', () => {
    expect(isLive(spontaneous('p'), T0)).toBe(true);
    expect(isLive(spontaneous('p'), T0 + 24 * 3_600_000)).toBe(true);
  });

  it('keeps a scheduled call with no end time live rather than dropping it', () => {
    expect(isLive(scheduled('s', { ends_at: null }), T0 + 3_600_000)).toBe(true);
  });

  it('treats a scheduled call with an unparseable end time as over', () => {
    expect(isLive(scheduled('s', { ends_at: 'not a date' }), T0)).toBe(false);
  });
});

describe('pickHeroCall', () => {
  it('returns null when nothing is live', () => {
    expect(pickHeroCall([])).toBeNull();
  });

  it('picks the most recently started call, from started_at', () => {
    const older = scheduled('older', { started_at: '2026-09-19T11:45:00Z' });
    const newer = scheduled('newer', { started_at: '2026-09-19T12:05:00Z' });

    expect(pickHeroCall([older, newer])).toBe(newer);
    expect(pickHeroCall([newer, older])).toBe(newer);
  });

  it('compares scheduled and spontaneous calls on the same footing', () => {
    // The spontaneous call has no end time, so an end-time-based pick could not
    // rank it at all; started_at can.
    const sched = scheduled('sched', { started_at: '2026-09-19T11:50:00Z' });
    const spont = spontaneous('spont', { started_at: '2026-09-19T11:58:00Z' });

    expect(pickHeroCall([sched, spont])).toBe(spont);
    expect(pickHeroCall([spont, sched])).toBe(spont);
  });

  it('keeps the server order on a tie', () => {
    const a = scheduled('a', { started_at: '2026-09-19T12:00:00Z' });
    const b = scheduled('b', { started_at: '2026-09-19T12:00:00Z' });

    expect(pickHeroCall([a, b])).toBe(a);
    expect(pickHeroCall([b, a])).toBe(b);
  });

  it('ranks an unparseable started_at last, whatever the order', () => {
    const bad = scheduled('bad', { started_at: 'nonsense' });
    const good = scheduled('good', { started_at: '2026-09-19T11:00:00Z' });

    expect(pickHeroCall([bad, good])).toBe(good);
    expect(pickHeroCall([good, bad])).toBe(good);
  });
});

describe('fetchLiveCalls stub', () => {
  const original = process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
    else process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = original;
  });

  const groups = [group('a'), group('b'), group('c')];

  it('reports no live calls by default, so no live card renders', async () => {
    delete process.env.EXPO_PUBLIC_STUB_LIVE_CALLS;
    await expect(fetchLiveCalls(groups)).resolves.toEqual([]);
  });

  it('fakes one group per listed type, in order, when the dev flag is set', async () => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = 'scheduled, spontaneous';
    const calls = await fetchLiveCalls(groups);

    expect(calls.map((c) => [c.group_id, c.call_type])).toEqual([
      ['a', 'scheduled'],
      ['b', 'spontaneous'],
    ]);
  });

  it('matches the target shape: a scheduled fake counts down, a spontaneous one has no end time', async () => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = 'scheduled,spontaneous';
    const [sched, spont] = await fetchLiveCalls(groups);

    expect(Object.keys(sched).sort()).toEqual(
      ['call_type', 'ends_at', 'group_id', 'id', 'participant_count', 'started_at'],
    );
    expect(hasCountdown(sched)).toBe(true);
    expect(new Date(sched.ends_at as string).getTime()).toBeGreaterThan(Date.now());
    expect(spont.ends_at).toBeNull();
    expect(hasCountdown(spont)).toBe(false);
  });

  it('starts the first listed call most recently, so it is the hero', async () => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = 'spontaneous,scheduled';
    const calls = await fetchLiveCalls(groups);
    expect(pickHeroCall(calls)).toBe(calls[0]);
  });

  it.each<[string, CallType[]]>([
    ['scheduled', ['scheduled']],
    ['spontaneous', ['spontaneous']],
    ['bogus,scheduled', ['scheduled']], // unknown entries are ignored, not faked
    ['', []],
  ])('reads "%s"', async (flag, types) => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = flag;
    const calls = await fetchLiveCalls(groups);
    expect(calls.map((c) => c.call_type)).toEqual(types);
  });

  it('never fakes more calls than there are groups', async () => {
    process.env.EXPO_PUBLIC_STUB_LIVE_CALLS = 'scheduled,scheduled,scheduled,scheduled';
    expect(await fetchLiveCalls([group('a')])).toHaveLength(1);
  });
});
