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

/** "12:04", or "1:02:03" past the hour. Minutes are unpadded; the design's calls are 2–30 min. */
export function formatCountdown(endsAt: string | number | Date, now: number): string {
  const total = secondsRemaining(endsAt, now);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
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
    if (active) setNow(Date.now());
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
