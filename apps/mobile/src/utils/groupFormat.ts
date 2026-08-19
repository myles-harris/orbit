export const MIN_CALL_DURATION = 2;
export const MAX_CALL_DURATION = 30;
export const MIN_WINDOW_HOUR = 0;
export const MAX_WINDOW_HOUR = 23;

/** 0 -> "12 AM", 13 -> "1 PM". */
export function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

/** WS-6: daily is always 1x/day, so it never carries a count. */
export function cadenceSummary(cadence: 'daily' | 'weekly', frequency: number): string {
  if (cadence === 'daily') return 'Daily';
  return `${frequency} ${frequency === 1 ? 'call' : 'calls'} per week`;
}

/** Upper bound for the window-start picker: always at least one hour before the end. */
export function windowStartMax(windowEnd: number): number {
  return Math.max(MIN_WINDOW_HOUR, windowEnd - 1);
}

/** Lower bound for the window-end picker: always at least one hour after the start. */
export function windowEndMin(windowStart: number): number {
  return Math.min(MAX_WINDOW_HOUR, windowStart + 1);
}

/**
 * Ratcheting ceiling. New groups cap at 30; a group already stored above it keeps
 * its true value until the owner steps down and saves, after which the cap applies.
 */
export function durationMax(savedDuration: number): number {
  return Math.max(MAX_CALL_DURATION, savedDuration);
}
