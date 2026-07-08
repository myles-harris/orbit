/**
 * Scheduling-window helpers.
 *
 * All scheduled calls are generated in a fixed wall-clock window in SCHEDULE_TZ
 * (currently hardcoded to Pacific Time — no per-group timezone support yet).
 * DST is handled correctly via Intl; no external dependencies.
 */

export const SCHEDULE_TZ = 'America/Los_Angeles';
export const WINDOW_START_MINUTES = 6 * 60;  // 6:00 AM
export const WINDOW_END_MINUTES = 22 * 60;   // 10:00 PM (exclusive)

/** Offset in ms of SCHEDULE_TZ from UTC at the given instant (negative for PT). */
function tzOffsetMs(atUtc: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TZ,
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

/** Convert a wall-clock time in SCHEDULE_TZ to a UTC Date. DST-safe. */
export function wallTimeToUtc(
  year: number, monthIndex: number, day: number, minutesIntoDay: number,
): Date {
  const guess = new Date(Date.UTC(year, monthIndex, day, 0, minutesIntoDay));
  const offset1 = tzOffsetMs(guess);
  const corrected = new Date(guess.getTime() - offset1);
  // Offset may differ across a DST boundary — re-derive at the corrected instant.
  const offset2 = tzOffsetMs(corrected);
  return offset2 === offset1 ? corrected : new Date(guess.getTime() - offset2);
}

/** Calendar date (y / monthIndex / d) of the given instant, as seen in SCHEDULE_TZ. */
export function calendarDateInTz(atUtc: Date): { year: number; monthIndex: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHEDULE_TZ,
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

/** Random UTC instant within [6:00 AM, 10:00 PM) SCHEDULE_TZ on the given calendar day. */
export function randomTimeInWindow(
  d: { year: number; monthIndex: number; day: number },
): Date {
  const minutes =
    WINDOW_START_MINUTES + Math.floor(Math.random() * (WINDOW_END_MINUTES - WINDOW_START_MINUTES));
  return wallTimeToUtc(d.year, d.monthIndex, d.day, minutes);
}

/** UTC bounds [start, end) of the given calendar day in SCHEDULE_TZ. For dedupe queries. */
export function dayBoundsUtc(
  d: { year: number; monthIndex: number; day: number },
): { start: Date; end: Date } {
  const next = addDays(d, 1);
  return {
    start: wallTimeToUtc(d.year, d.monthIndex, d.day, 0),
    end: wallTimeToUtc(next.year, next.monthIndex, next.day, 0),
  };
}
