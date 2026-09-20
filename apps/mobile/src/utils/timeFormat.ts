const TIME_OF_DAY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** "9:41 AM" — the device's own clock format and locale. */
export function formatTimeOfDay(at: number | string | Date): string {
  return new Date(at).toLocaleTimeString(undefined, TIME_OF_DAY);
}

/**
 * When cached data was fetched, for "Showing groups saved at …". A time alone is
 * ambiguous once the copy is more than a day old — "9:41 AM" could be this morning
 * or last week — so anything not from today carries its date.
 */
export function formatSavedAt(fetchedAt: number, now: number): string {
  const saved = new Date(fetchedAt);
  const time = formatTimeOfDay(saved);
  if (saved.toDateString() === new Date(now).toDateString()) return time;
  return `${saved.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}
