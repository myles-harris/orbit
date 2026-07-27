/**
 * Scheduling-window helpers.
 *
 * All functions accept an optional timeZone (IANA string) so calls can be
 * scheduled in the group owner's local timezone rather than a fixed global TZ.
 * Defaults preserve backward compatibility with the original Pacific-time logic.
 */

export const SCHEDULE_TZ = 'America/Los_Angeles';
export const WINDOW_START_MINUTES = 6 * 60;  // 6:00 AM
export const WINDOW_END_MINUTES = 22 * 60;   // 10:00 PM (exclusive)

/** Offset in ms of `timeZone` from UTC at the given instant. */
function tzOffsetMs(atUtc: Date, timeZone: string = SCHEDULE_TZ): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(atUtc).map(p => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  return asIfUtc - atUtc.getTime();
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. DST-safe. */
export function wallTimeToUtc(
  year: number, monthIndex: number, day: number, minutesIntoDay: number,
  timeZone: string = SCHEDULE_TZ,
): Date {
  const guess = new Date(Date.UTC(year, monthIndex, day, 0, minutesIntoDay));
  const offset1 = tzOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset1);
  const offset2 = tzOffsetMs(corrected, timeZone);
  return offset2 === offset1 ? corrected : new Date(guess.getTime() - offset2);
}

/** Calendar date (y / monthIndex / d) of the given instant, as seen in `timeZone`. */
export function calendarDateInTz(
  atUtc: Date,
  timeZone: string = SCHEDULE_TZ,
): { year: number; monthIndex: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(atUtc).map(p => [p.type, p.value]));
  return { year: Number(parts.year), monthIndex: Number(parts.month) - 1, day: Number(parts.day) };
}

/** Advance a calendar date by N days (calendar-safe via Date.UTC normalization). */
export function addDays(
  d: { year: number; monthIndex: number; day: number }, days: number,
): { year: number; monthIndex: number; day: number } {
  const t = new Date(Date.UTC(d.year, d.monthIndex, d.day + days));
  return { year: t.getUTCFullYear(), monthIndex: t.getUTCMonth(), day: t.getUTCDate() };
}

/**
 * Random UTC instant within [windowStartMinutes, windowEndMinutes) in `timeZone`
 * on the given calendar day. Defaults to the legacy [6 AM, 10 PM) PT window.
 */
export function randomTimeInWindow(
  d: { year: number; monthIndex: number; day: number },
  windowStartMinutes: number = WINDOW_START_MINUTES,
  windowEndMinutes: number = WINDOW_END_MINUTES,
  timeZone: string = SCHEDULE_TZ,
): Date {
  const minutes =
    windowStartMinutes + Math.floor(Math.random() * (windowEndMinutes - windowStartMinutes));
  return wallTimeToUtc(d.year, d.monthIndex, d.day, minutes, timeZone);
}

/** UTC bounds [start, end) of the given calendar day in `timeZone`. For dedupe queries. */
export function dayBoundsUtc(
  d: { year: number; monthIndex: number; day: number },
  timeZone: string = SCHEDULE_TZ,
): { start: Date; end: Date } {
  const next = addDays(d, 1);
  return {
    start: wallTimeToUtc(d.year, d.monthIndex, d.day, 0, timeZone),
    end: wallTimeToUtc(next.year, next.monthIndex, next.day, 0, timeZone),
  };
}

/** 'YYYY-MM-DD' key for a calendar date. */
export function dayKeyForDate(d: { year: number; monthIndex: number; day: number }): string {
  return `${d.year}-${String(d.monthIndex + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' key for a UTC instant as seen in `timeZone`. */
export function dayKey(atUtc: Date, timeZone: string = SCHEDULE_TZ): string {
  return dayKeyForDate(calendarDateInTz(atUtc, timeZone));
}

/** Fisher-Yates uniform shuffle (in-place copy). */
export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
