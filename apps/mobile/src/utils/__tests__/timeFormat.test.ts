import { formatSavedAt, formatTimeOfDay } from '../timeFormat';

// Built from local-time components, so the hour reads the same wherever the suite runs.
const at = (day: number, hour: number, minute: number) => new Date(2026, 8, day, hour, minute).getTime();

describe('formatTimeOfDay', () => {
  it('reads the hour and the two-digit minute in the device clock', () => {
    expect(formatTimeOfDay(at(19, 9, 41))).toMatch(/^0?9:41/);
    expect(formatTimeOfDay(at(19, 14, 5))).toMatch(/^(2:05|14:05)/); // 12- or 24-hour, by locale
  });

  it('accepts a Date or an ISO string as well as epoch ms', () => {
    const ms = at(19, 9, 41);
    expect(formatTimeOfDay(new Date(ms))).toBe(formatTimeOfDay(ms));
    expect(formatTimeOfDay(new Date(ms).toISOString())).toBe(formatTimeOfDay(ms));
  });
});

describe('formatSavedAt', () => {
  it('is just the time for a copy from today', () => {
    const out = formatSavedAt(at(19, 9, 41), at(19, 14, 5));
    expect(out).toBe(formatTimeOfDay(at(19, 9, 41)));
    expect(out).not.toMatch(/Sep/);
  });

  it('carries the date for a copy from any other day, where a bare time would mislead', () => {
    const out = formatSavedAt(at(17, 9, 41), at(19, 14, 5));
    expect(out).toMatch(/Sep 17/);
    expect(out).toContain(formatTimeOfDay(at(17, 9, 41)));
  });

  it('counts across midnight as another day, even a minute apart', () => {
    expect(formatSavedAt(at(18, 23, 59), at(19, 0, 1))).toMatch(/Sep 18/);
  });

  it('reads a copy from later than now as another day rather than as today', () => {
    // A device clock set back: better a date on it than a time that looks current.
    expect(formatSavedAt(at(21, 9, 41), at(19, 14, 5))).toMatch(/Sep 21/);
  });
});
