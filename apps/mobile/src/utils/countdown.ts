import { useEffect, useLayoutEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whole seconds until `endsAt`, rounded up so the display only reads 0:00 once the
 * call is actually over. Never negative; an unparseable timestamp counts as ended.
 *
 * A pure function of `now` on purpose: the countdown is never decremented. React
 * Native throttles timers in the background, so a counter that subtracts one per
 * tick is 60 seconds stale after a minute away, while this is right the instant
 * `now` is refreshed.
 */
export function secondsRemaining(endsAt: string | number | Date, now: number): number {
  const end = typeof endsAt === 'number' ? endsAt : new Date(endsAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/**
 * Whole seconds since `startedAt`, rounded down so the display reads 0:00 until a
 * full second has passed — the mirror of `secondsRemaining`, which rounds up. Never
 * negative (a device clock a little behind the server's would otherwise show a
 * negative time on a call that just began); an unparseable timestamp counts as 0.
 *
 * Pure in `now` for the same reason `secondsRemaining` is.
 */
export function secondsElapsed(startedAt: string | number | Date, now: number): number {
  const start = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/** "12:04", or "1:02:03" past the hour. Minutes are unpadded; the design's calls are 2–30 min. */
function formatSeconds(total: number): string {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Time left, in `formatSeconds`' shape. */
export function formatCountdown(endsAt: string | number | Date, now: number): string {
  return formatSeconds(secondsRemaining(endsAt, now));
}

/** Time since the start, in the same shape and tabular width as `formatCountdown`. */
export function formatElapsed(startedAt: string | number | Date, now: number): string {
  return formatSeconds(secondsElapsed(startedAt, now));
}

interface UseNowOptions {
  /** False while the screen is blurred or there is nothing to count down. */
  active: boolean;
  /** Epoch ms. Once `now` reaches it the interval stops — nothing left to tick toward. */
  until?: number;
  intervalMs?: number;
}

/**
 * Wall-clock time, refreshed every `intervalMs` while `active`.
 *
 * Every refresh reads `Date.now()` rather than adding to the previous value, and
 * the app returning to the foreground refreshes immediately instead of waiting for
 * a throttled interval to fire. The interval is cleared when `active` goes false
 * (screen blurred), when `until` is reached, and on unmount.
 */
export function useNow({ active, until = Infinity, intervalMs = 1000 }: UseNowOptions): number {
  const [now, setNow] = useState(() => Date.now());

  // Before paint, so the first frame after (re)activating never draws the time from
  // mount or from when the screen was last blurred: a call that arrived ten minutes
  // in would otherwise flash a stale countdown, and an ended one a Join button.
  useLayoutEffect(() => {
    if (!active) return;
    const t = Date.now();
    // A set that changes nothing still costs React a spare render pass.
    if (t !== now) setNow(t);
  }, [active, until]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer);
    }, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [active, until, intervalMs]);

  return now;
}

/**
 * Wall-clock time that moves only when a deadline passes — for a caller that needs
 * to know *whether* something has ended, not how long is left. `useNow` ticks every
 * second, and a screen driven by that beat redraws everything on it once a second.
 *
 * It sets one timeout for the earliest deadline still ahead of `now`. When that
 * fires, `now` moves past it and the next deadline, if any, is scheduled; with none
 * ahead there is no timer at all. Foregrounding and re-activating refresh at once,
 * because timers are throttled while away and a deadline may have passed unseen.
 *
 * `deadlines` is read fresh each render, so passing a new array every time is fine.
 */
export function useClockAt(deadlines: number[], active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  let next = Infinity;
  for (const deadline of deadlines) {
    if (deadline > now && deadline < next) next = deadline;
  }

  // Before paint, for the same reason as in useNow.
  useLayoutEffect(() => {
    if (!active) return;
    const t = Date.now();
    if (t !== now) setNow(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, [active]);

  useEffect(() => {
    if (!active || next === Infinity) return;
    const timer = setTimeout(
      // Never land short of the deadline: were the clock a hair behind the timer,
      // `next` would not change, the effect would not re-run, and it would be lost.
      () => setNow(Math.max(Date.now(), next)),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [active, next]);

  return now;
}
