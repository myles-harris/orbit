/**
 * Call-window conversion utilities.
 * All timezone operations use Intl APIs — no external libraries required.
 */

function getUtcOffsetMinutes(date: Date, tz: string): number {
  // Format the date in the target timezone, then re-parse as if UTC to get the local-wall time.
  // The difference between that and the actual UTC timestamp is the UTC offset.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => {
    const val = parts.find(p => p.type === type)?.value ?? '0';
    return parseInt(val, 10);
  };

  const year = get('year');
  const month = get('month') - 1;
  const day = get('day');
  const hour = get('hour') % 24; // hour can be 24 on midnight in some engines
  const minute = get('minute');
  const second = get('second');

  const wallAsUtc = Date.UTC(year, month, day, hour, minute, second);
  return Math.round((wallAsUtc - date.getTime()) / 60000);
}

/**
 * Convert a group's call window from the group's timezone to the viewer's timezone.
 *
 * @param windowStartHour  Hour (0–23) the window opens, in groupTz
 * @param windowEndHour    Hour (0–23) the window closes (exclusive), in groupTz
 * @param groupTz          IANA timezone the window is defined in
 * @param viewerTz         IANA timezone to convert into
 * @param anchor           Reference date for DST-correct offset lookup (default: now)
 * @returns startMinutes / endMinutes in viewer's timezone (0–1439),
 *          plus dayShift: -1 window starts previous day, 0 same day, 1 next day
 */
export function toViewerWindow(
  windowStartHour: number,
  windowEndHour: number,
  groupTz: string,
  viewerTz: string,
  anchor: Date = new Date(),
): { startMinutes: number; endMinutes: number; dayShift: number } {
  const groupOffset = getUtcOffsetMinutes(anchor, groupTz);
  const viewerOffset = getUtcOffsetMinutes(anchor, viewerTz);
  const shiftMinutes = viewerOffset - groupOffset;

  const MINUTES_PER_DAY = 1440;
  const rawStart = windowStartHour * 60 + shiftMinutes;
  const rawEnd = windowEndHour * 60 + shiftMinutes;

  const startMinutes = ((rawStart % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const endMinutes = ((rawEnd % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  const dayShift = rawStart < 0 ? -1 : rawStart >= MINUTES_PER_DAY ? 1 : 0;

  return { startMinutes, endMinutes, dayShift };
}

/**
 * Format a minute-of-day value (0–1439) as a human-readable time string.
 * e.g. 0 → "12 AM", 60 → "1 AM", 780 → "1 PM", 795 → "1:15 PM"
 */
export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 || 12;
  if (m === 0) return `${displayHour} ${period}`;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format a group call window in the viewer's local timezone as a display string.
 * Returns e.g. "6 AM – 10 PM" or "11:30 AM – 3:30 AM (next day)"
 */
export function formatViewerWindow(
  windowStartHour: number,
  windowEndHour: number,
  groupTz: string,
  viewerTz: string,
  anchor?: Date,
): string {
  if (groupTz === viewerTz) {
    return `${formatMinutes(windowStartHour * 60)} – ${formatMinutes(windowEndHour * 60)}`;
  }

  const { startMinutes, endMinutes, dayShift } = toViewerWindow(
    windowStartHour,
    windowEndHour,
    groupTz,
    viewerTz,
    anchor,
  );

  const start = formatMinutes(startMinutes);
  const end = formatMinutes(endMinutes);

  if (dayShift === 1) return `${start} – ${end} (next day)`;
  if (dayShift === -1) return `${start} – ${end} (prev day)`;
  return `${start} – ${end}`;
}
