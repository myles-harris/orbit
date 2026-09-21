import { act } from 'react';
import { AppState, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { formatCountdown, formatElapsed, secondsElapsed, secondsRemaining, useClockAt, useNow } from '../countdown';
import { CallTimer } from '../../components/CallTimer';
import type { LiveCall } from '../liveCalls';

const T0 = Date.parse('2026-09-19T12:00:00.000Z');
const ENDS_AT = '2026-09-19T12:15:00.000Z'; // fifteen minutes after T0

// T6 — the countdown is a pure function of `now`.
describe('formatCountdown (T6)', () => {
  it('is a pure function of now: same inputs, same string, whatever ran before', () => {
    expect(formatCountdown(ENDS_AT, T0)).toBe('15:00');
    expect(formatCountdown(ENDS_AT, T0 + 1000)).toBe('14:59');
    expect(formatCountdown(ENDS_AT, T0)).toBe('15:00'); // going "back" is fine — nothing is decremented
    expect(formatCountdown(ENDS_AT, T0 + 60_000)).toBe('14:00');
  });

  it('rounds partial seconds up, so 0:00 means the call is over', () => {
    const end = T0 + 12 * 60_000 + 4_000;
    expect(formatCountdown(end, T0)).toBe('12:04');
    expect(formatCountdown(end, T0 + 300)).toBe('12:04'); // 12:03.7 left
    expect(formatCountdown(end, end - 1)).toBe('0:01');
    expect(formatCountdown(end, end)).toBe('0:00');
  });

  it('never goes negative, and treats an unparseable timestamp as ended', () => {
    expect(secondsRemaining(ENDS_AT, T0 + 3_600_000)).toBe(0);
    expect(formatCountdown(ENDS_AT, T0 + 3_600_000)).toBe('0:00');
    expect(formatCountdown('not a date', T0)).toBe('0:00');
  });

  it('pads seconds and, past the hour, minutes', () => {
    expect(formatCountdown(T0 + 125_000, T0)).toBe('2:05');
    expect(formatCountdown(T0 + 3_723_000, T0)).toBe('1:02:03');
  });

  it('accepts a Date or epoch ms as well as an ISO string', () => {
    expect(formatCountdown(new Date(ENDS_AT), T0)).toBe('15:00');
    expect(formatCountdown(Date.parse(ENDS_AT), T0)).toBe('15:00');
  });
});

function NowText({ active = true, until }: { active?: boolean; until?: number }) {
  const now = useNow({ active, until });
  return <Text>{formatCountdown(ENDS_AT, now)}</Text>;
}

const shown = (tree: ReactTestRenderer) => tree.root.findByType(Text).props.children as string;

describe('useNow (T6)', () => {
  let emitAppState: (state: string) => void;
  let foreground: () => void;
  let removed: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    removed = jest.fn();
    emitAppState = () => {};
    foreground = () => emitAppState('active');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      // Only the 'change' event is ever forwarded — the real one would not deliver
      // anything for another name.
      if (type === 'change') emitAppState = handler as (state: string) => void;
      return { remove: removed } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('ticks once a second', async () => {
    const tree = await render(<NowText />);
    expect(shown(tree)).toBe('15:00');

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(shown(tree)).toBe('14:59');
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:57');
  });

  it('is right after 60s in the background, not 60s stale and not one tick behind', async () => {
    const tree = await render(<NowText />);
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:58');

    // Backgrounded: RN throttles the timers, so no tick fires, but the wall clock
    // keeps going. setSystemTime moves the clock without running the interval.
    jest.setSystemTime(Date.now() + 60_000);
    expect(shown(tree)).toBe('14:58'); // nothing has told the screen yet

    await act(async () => { foreground(); });

    // Recomputed from ends_at: 14:58 minus the 60 seconds away. A counter that
    // decremented per tick would read 14:57 here.
    expect(shown(tree)).toBe('13:58');
    expect(shown(tree)).toBe(formatCountdown(ENDS_AT, T0 + 62_000));
  });

  it('only refreshes when the app becomes active, not when it goes to the background', async () => {
    const tree = await render(<NowText />);
    jest.setSystemTime(T0 + 90_000);

    await act(async () => { emitAppState('background'); });
    expect(shown(tree)).toBe('15:00');
    await act(async () => { emitAppState('inactive'); });
    expect(shown(tree)).toBe('15:00');
    await act(async () => { emitAppState('active'); });
    expect(shown(tree)).toBe('13:30');
  });

  it('re-arms when `until` changes while mounted', async () => {
    const tree = await render(<NowText until={T0 + 2000} />);
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:58');
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(shown(tree)).toBe('14:58'); // stopped at `until`

    // A new call arrives with a later end: ticking resumes from the current time.
    await act(async () => { tree.update(<NowText until={T0 + 60_000} />); });
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:53');
  });

  it('refreshes on focus as well as on resume: re-activating reads the clock immediately', async () => {
    const tree = await render(<NowText active={false} />);
    expect(shown(tree)).toBe('15:00');

    jest.setSystemTime(T0 + 90_000); // blurred for a minute and a half
    await act(async () => { tree.update(<NowText active />); });

    expect(shown(tree)).toBe('13:30');
  });

  // React's test scheduler parks callbacks on the fake timers too, so
  // getTimerCount() is not the hook's alone. These watch the hook's own
  // setInterval/clearInterval calls instead.
  it('clears its interval and app-state listener when blurred and on unmount', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');

    const tree = await render(<NowText active={false} />);
    expect(started).not.toHaveBeenCalled(); // an inactive hook runs and subscribes to nothing
    expect(removed).not.toHaveBeenCalled();

    await act(async () => { tree.update(<NowText active />); });
    expect(started).toHaveBeenCalledTimes(1);
    const interval = started.mock.results[0].value;

    await act(async () => { tree.update(<NowText active={false} />); });
    expect(cleared).toHaveBeenCalledWith(interval);
    expect(removed).toHaveBeenCalledTimes(1);

    const before = shown(tree);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(shown(tree)).toBe(before); // blurred: it does not tick

    await act(async () => { tree.update(<NowText active />); });
    expect(started).toHaveBeenCalledTimes(2);
    const second = started.mock.results[1].value;
    await act(async () => { tree.unmount(); });
    expect(cleared).toHaveBeenCalledWith(second);
    expect(removed).toHaveBeenCalledTimes(2);
  });

  it('stops ticking once it reaches `until`', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');

    const tree = await render(<NowText until={T0 + 3000} />);
    const interval = started.mock.results[0].value;
    expect(cleared).not.toHaveBeenCalledWith(interval);

    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:58');
    expect(cleared).not.toHaveBeenCalledWith(interval); // still short of `until`

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(shown(tree)).toBe('14:57');
    expect(cleared).toHaveBeenCalledWith(interval);

    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(shown(tree)).toBe('14:57'); // and it stays stopped
  });
});

// ─── useClockAt ───────────────────────────────────────────────────────────────
// The screen-level clock: it moves only when a deadline passes, so a screen driven
// by it re-renders when a call ends rather than once a second.

let clockRenders = 0;

function Clock({ deadlines, active = true }: { deadlines: number[]; active?: boolean }) {
  const now = useClockAt(deadlines, active);
  clockRenders += 1;
  return <Text>{now - T0}</Text>;
}

const clockNow = (tree: ReactTestRenderer) => tree.root.findByType(Text).props.children as number;

/** The delays of the timeouts started so far. React parks 0ms callbacks on the fake timers too. */
const delays = (spy: jest.SpyInstance) => spy.mock.calls.map(([, ms]) => ms as number).filter((ms) => ms >= 1000);

describe('useClockAt', () => {
  let emitAppState: (state: string) => void;
  let removed: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    clockRenders = 0;
    removed = jest.fn();
    emitAppState = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') emitAppState = handler as (state: string) => void;
      return { remove: removed } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  it('sets no timer at all when there are no deadlines', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    await mount(<Clock deadlines={[]} />);
    expect(delays(set)).toEqual([]);
  });

  it('ignores a deadline that has already passed', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    await mount(<Clock deadlines={[T0 - 1000, T0]} />);
    expect(delays(set)).toEqual([]);
  });

  it('sets one timeout, for the earliest deadline still ahead', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    await mount(<Clock deadlines={[T0 + 9000, T0 + 5000, T0 + 20_000]} />);
    expect(delays(set)).toEqual([5000]);
  });

  it('re-renders when a deadline passes — not once a second', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    const tree = await mount(<Clock deadlines={[T0 + 5000, T0 + 9000]} />);
    const settled = clockRenders;

    // Just short of the first deadline: a 1 Hz clock would have rendered four times.
    await act(async () => { jest.advanceTimersByTime(4999); });
    expect(clockRenders).toBe(settled);
    expect(clockNow(tree)).toBe(0);

    await act(async () => { jest.advanceTimersByTime(1); });
    expect(clockNow(tree)).toBe(5000);
    expect(clockRenders).toBe(settled + 1);
    expect(delays(set)).toEqual([5000, 4000]); // the next deadline is now scheduled

    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(clockNow(tree)).toBe(9000);
    expect(clockRenders).toBe(settled + 2);

    // Nothing left ahead: no more timers, no more renders.
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(clockRenders).toBe(settled + 2);
    expect(delays(set)).toEqual([5000, 4000]);
  });

  it('is right after time away: resuming recomputes and skips deadlines that passed unseen', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    const tree = await mount(<Clock deadlines={[T0 + 5000, T0 + 9000, T0 + 20_000]} />);
    expect(delays(set)).toEqual([5000]);

    // Backgrounded ten seconds: the timers are throttled, the wall clock is not.
    jest.setSystemTime(T0 + 10_000);
    expect(clockNow(tree)).toBe(0); // nothing has told the screen yet

    await act(async () => { emitAppState('active'); });

    expect(clockNow(tree)).toBe(10_000);
    // The 5s and 9s deadlines went by unseen; the next one ahead is 20s, ten away.
    expect(delays(set)).toEqual([5000, 10_000]);
  });

  it('only refreshes when the app becomes active', async () => {
    const tree = await mount(<Clock deadlines={[T0 + 60_000]} />);
    jest.setSystemTime(T0 + 10_000);

    await act(async () => { emitAppState('background'); });
    await act(async () => { emitAppState('inactive'); });
    expect(clockNow(tree)).toBe(0);
  });

  it('reads the clock at once when re-activated, before any timer could fire', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    const tree = await mount(<Clock deadlines={[T0 + 120_000]} active={false} />);
    expect(delays(set)).toEqual([]); // blurred: nothing scheduled

    jest.setSystemTime(T0 + 90_000);
    await act(async () => { tree.update(<Clock deadlines={[T0 + 120_000]} active />); });

    expect(clockNow(tree)).toBe(90_000);
    expect(delays(set)).toEqual([30_000]);
  });

  it('re-arms when the deadlines change while mounted', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    const cleared = jest.spyOn(globalThis, 'clearTimeout');
    const tree = await mount(<Clock deadlines={[T0 + 5000]} />);
    const first = set.mock.results[set.mock.calls.findIndex(([, ms]) => ms === 5000)].value;

    await act(async () => { tree.update(<Clock deadlines={[T0 + 3000]} />); });

    expect(delays(set)).toEqual([5000, 3000]);
    expect(cleared).toHaveBeenCalledWith(first);
  });

  it('clears its timeout and app-state listener when blurred and on unmount', async () => {
    const set = jest.spyOn(globalThis, 'setTimeout');
    const cleared = jest.spyOn(globalThis, 'clearTimeout');
    const tree = await mount(<Clock deadlines={[T0 + 5000]} />);
    const idOf = (ms: number, nth = 0) =>
      set.mock.results[set.mock.calls.map(([, d]) => d).indexOf(ms, nth)].value;
    const first = idOf(5000);

    await act(async () => { tree.update(<Clock deadlines={[T0 + 5000]} active={false} />); });
    expect(cleared).toHaveBeenCalledWith(first);
    expect(removed).toHaveBeenCalledTimes(1);

    const before = clockNow(tree);
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(clockNow(tree)).toBe(before); // blurred: it does not wake

    await act(async () => { tree.update(<Clock deadlines={[T0 + 60_000]} active />); });
    const second = set.mock.results[set.mock.calls.length - 1].value;
    await act(async () => { tree.unmount(); });
    expect(cleared).toHaveBeenCalledWith(second);
    expect(removed).toHaveBeenCalledTimes(2);
  });

  it('still crosses the deadline when the timer fires with the clock a hair behind it', async () => {
    // A timer can wake before Date.now() has caught up. Were `now` set to that
    // stale reading, `next` would not change, the effect would not re-run, and the
    // deadline would never be seen.
    jest.useRealTimers();
    jest.useFakeTimers({ doNotFake: ['Date'] });
    jest.spyOn(Date, 'now').mockReturnValue(T0);

    const tree = await mount(<Clock deadlines={[T0 + 5000]} />);
    await act(async () => { jest.advanceTimersByTime(5000); }); // Date.now() still says T0

    expect(clockNow(tree)).toBe(5000);
  });
});

// ─── Count-up ─────────────────────────────────────────────────────────────────

const STARTED_AT = '2026-09-19T11:58:00.000Z'; // two minutes before T0

// T18 — the elapsed time is a pure function of `now`, the mirror of the countdown.
describe('formatElapsed (T18)', () => {
  it('is a pure function of now: same inputs, same string', () => {
    expect(formatElapsed(STARTED_AT, T0)).toBe('2:00');
    expect(formatElapsed(STARTED_AT, T0 + 1000)).toBe('2:01');
    expect(formatElapsed(STARTED_AT, T0)).toBe('2:00');
  });

  it('rounds partial seconds down, so 0:00 holds until a full second has passed', () => {
    const start = T0;
    expect(formatElapsed(start, start)).toBe('0:00');
    expect(formatElapsed(start, start + 999)).toBe('0:00');
    expect(formatElapsed(start, start + 1000)).toBe('0:01');
  });

  it('never goes negative when the device clock is behind the server, and never reads NaN', () => {
    expect(secondsElapsed(T0 + 5000, T0)).toBe(0);
    expect(formatElapsed(T0 + 5000, T0)).toBe('0:00');
    expect(secondsElapsed('not a date', T0)).toBe(0);
    expect(formatElapsed('not a date', T0)).toBe('0:00');
  });

  it('shares the countdown\'s shape, including past the hour', () => {
    expect(formatElapsed(T0 - 125_000, T0)).toBe('2:05');
    expect(formatElapsed(T0 - 3_723_000, T0)).toBe('1:02:03');
  });

  it('crosses 9:59 → 10:00 as one more digit, with nothing else changing', () => {
    expect(formatElapsed(T0 - 599_000, T0)).toBe('9:59');
    expect(formatElapsed(T0 - 600_000, T0)).toBe('10:00');
  });
});

// ─── CallTimer ────────────────────────────────────────────────────────────────

describe('CallTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const call = (over: Partial<LiveCall> = {}): LiveCall => ({
    id: 'c1',
    group_id: 'g1',
    call_type: 'scheduled',
    started_at: new Date(T0 - 60_000).toISOString(),
    ends_at: ENDS_AT,
    participant_count: 2,
    ...over,
  });
  const spontaneous = (over: Partial<LiveCall> = {}) =>
    call({ call_type: 'spontaneous', ends_at: null, started_at: STARTED_AT, ...over });

  async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(element);
    });
    return tree;
  }

  const text = (tree: ReactTestRenderer) => ((tree.toJSON() as { children: string[] }).children ?? []).join('');

  it('renders the formatted countdown and ticks on its own', async () => {
    const tree = await mount(<Text><CallTimer call={call()} active /></Text>);
    expect(text(tree)).toBe('15:00');

    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(text(tree)).toBe('14:57');
  });

  it('re-renders alone: the parent does not render while it ticks', async () => {
    let parentRenders = 0;
    function Parent() {
      parentRenders += 1;
      return <Text><CallTimer call={call()} active /></Text>;
    }
    const tree = await mount(<Parent />);
    const settled = parentRenders;

    await act(async () => { jest.advanceTimersByTime(3000); });

    expect(text(tree)).toBe('14:57'); // it did tick…
    expect(parentRenders).toBe(settled); // …without the parent rendering once
  });

  it('runs no clock while inactive', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    await mount(<Text><CallTimer call={call()} active={false} /></Text>);
    expect(started.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(0);
  });

  it('stops at the end and reads 0:00', async () => {
    const soon = new Date(T0 + 2000).toISOString();
    const tree = await mount(<Text><CallTimer call={call({ ends_at: soon })} active /></Text>);

    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(text(tree)).toBe('0:00');
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(text(tree)).toBe('0:00');
  });

  // T18 — the timer branch, at the component: the direction follows `call_type`.
  describe('direction (T18)', () => {
    it('counts UP from started_at for a spontaneous call, on its own clock', async () => {
      const tree = await mount(<Text><CallTimer call={spontaneous()} active /></Text>);
      expect(text(tree)).toBe('2:00');

      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(text(tree)).toBe('2:03');
    });

    it('never stops counting up, however long the call has run', async () => {
      const tree = await mount(<Text><CallTimer call={spontaneous()} active /></Text>);

      await act(async () => { jest.advanceTimersByTime(3_600_000); });
      expect(text(tree)).toBe('1:02:00');
    });

    it('crosses 9:59 → 10:00 counting up without a stray character', async () => {
      const call9 = spontaneous({ started_at: new Date(T0 - 597_000).toISOString() }); // 9:57 in
      const tree = await mount(<Text><CallTimer call={call9} active /></Text>);
      const seen = [text(tree)];
      for (let i = 0; i < 4; i++) {
        await act(async () => { jest.advanceTimersByTime(1000); });
        seen.push(text(tree));
      }
      expect(seen).toEqual(['9:57', '9:58', '9:59', '10:00', '10:01']);
    });

    it('crosses 10:00 → 9:59 counting down the same way', async () => {
      const end = new Date(T0 + 602_000).toISOString(); // 10:02 left
      const tree = await mount(<Text><CallTimer call={call({ ends_at: end })} active /></Text>);
      const seen = [text(tree)];
      for (let i = 0; i < 4; i++) {
        await act(async () => { jest.advanceTimersByTime(1000); });
        seen.push(text(tree));
      }
      expect(seen).toEqual(['10:02', '10:01', '10:00', '9:59', '9:58']);
    });

    it('falls back to elapsed for a scheduled call with no ends_at — never NaN — and logs the fault once', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const faulty = call({ ends_at: null, started_at: STARTED_AT });
      const tree = await mount(<Text><CallTimer call={faulty} active /></Text>);

      expect(text(tree)).toBe('2:00');
      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(text(tree)).toBe('2:05');
      expect(text(tree)).not.toMatch(/NaN/);

      // Once for the call, not once a second.
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0].join(' ')).toContain('c1');
    });

    it('logs nothing for a well-formed call of either type', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      await mount(<Text><CallTimer call={call()} active /></Text>);
      await mount(<Text><CallTimer call={spontaneous()} active /></Text>);
      expect(error).not.toHaveBeenCalled();
    });

    it('runs no clock while inactive, in either direction', async () => {
      const started = jest.spyOn(globalThis, 'setInterval');
      await mount(<Text><CallTimer call={spontaneous()} active={false} /></Text>);
      expect(started.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(0);
    });
  });
});
