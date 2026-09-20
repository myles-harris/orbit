import { act } from 'react';
import { AppState, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { formatCountdown, secondsRemaining, useNow } from '../countdown';

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

function Countdown({ active = true, until }: { active?: boolean; until?: number }) {
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
    const tree = await render(<Countdown />);
    expect(shown(tree)).toBe('15:00');

    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(shown(tree)).toBe('14:59');
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:57');
  });

  it('is right after 60s in the background, not 60s stale and not one tick behind', async () => {
    const tree = await render(<Countdown />);
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
    const tree = await render(<Countdown />);
    jest.setSystemTime(T0 + 90_000);

    await act(async () => { emitAppState('background'); });
    expect(shown(tree)).toBe('15:00');
    await act(async () => { emitAppState('inactive'); });
    expect(shown(tree)).toBe('15:00');
    await act(async () => { emitAppState('active'); });
    expect(shown(tree)).toBe('13:30');
  });

  it('re-arms when `until` changes while mounted', async () => {
    const tree = await render(<Countdown until={T0 + 2000} />);
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:58');
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(shown(tree)).toBe('14:58'); // stopped at `until`

    // A new call arrives with a later end: ticking resumes from the current time.
    await act(async () => { tree.update(<Countdown until={T0 + 60_000} />); });
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(shown(tree)).toBe('14:53');
  });

  it('refreshes on focus as well as on resume: re-activating reads the clock immediately', async () => {
    const tree = await render(<Countdown active={false} />);
    expect(shown(tree)).toBe('15:00');

    jest.setSystemTime(T0 + 90_000); // blurred for a minute and a half
    await act(async () => { tree.update(<Countdown active />); });

    expect(shown(tree)).toBe('13:30');
  });

  // React's test scheduler parks callbacks on the fake timers too, so
  // getTimerCount() is not the hook's alone. These watch the hook's own
  // setInterval/clearInterval calls instead.
  it('clears its interval and app-state listener when blurred and on unmount', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');

    const tree = await render(<Countdown active={false} />);
    expect(started).not.toHaveBeenCalled(); // an inactive hook runs and subscribes to nothing
    expect(removed).not.toHaveBeenCalled();

    await act(async () => { tree.update(<Countdown active />); });
    expect(started).toHaveBeenCalledTimes(1);
    const interval = started.mock.results[0].value;

    await act(async () => { tree.update(<Countdown active={false} />); });
    expect(cleared).toHaveBeenCalledWith(interval);
    expect(removed).toHaveBeenCalledTimes(1);

    const before = shown(tree);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(shown(tree)).toBe(before); // blurred: it does not tick

    await act(async () => { tree.update(<Countdown active />); });
    expect(started).toHaveBeenCalledTimes(2);
    const second = started.mock.results[1].value;
    await act(async () => { tree.unmount(); });
    expect(cleared).toHaveBeenCalledWith(second);
    expect(removed).toHaveBeenCalledTimes(2);
  });

  it('stops ticking once it reaches `until`', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    const cleared = jest.spyOn(globalThis, 'clearInterval');

    const tree = await render(<Countdown until={T0 + 3000} />);
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
