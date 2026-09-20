// The call-window dial is a 24-hour clock face: midnight at 12 o'clock, hours
// advancing clockwise. This is the pure maths behind it, kept out of the
// component so the mapping can be checked against the design's own numbers
// without rendering anything.

// 360 / 24 is exactly 15, so an hour's angle is an exact integer — no float
// drift to trip an equality check or an SVG rotation.
const DEGREES_PER_HOUR = 15;

/** Clock angle in degrees, 0 at 12 o'clock and clockwise. hourAngle(6) = 90, hourAngle(22) = 330. */
export function hourAngle(hour: number): number {
  return hour * DEGREES_PER_HOUR;
}

/** Hours from `start` to `end` going clockwise, wrapping midnight. windowSpan(6, 22) = 16, windowSpan(22, 2) = 4. */
export function windowSpan(start: number, end: number): number {
  return (((end - start) % 24) + 24) % 24;
}

/** Length of the marigold arc on a ring of the given circumference. */
export function arcLength(start: number, end: number, circumference: number): number {
  return (windowSpan(start, end) / 24) * circumference;
}

/** SVG strokes begin at 3 o'clock; the clock begins at 12. Rotating by this puts the arc's start on `start`. */
export function arcRotation(start: number): number {
  return hourAngle(start) - 90;
}

/** Where an hour sits on a circle of `radius` about (cx, cy). */
export function hourPoint(hour: number, cx: number, cy: number, radius: number): { x: number; y: number } {
  const theta = (hourAngle(hour) * Math.PI) / 180;
  return { x: cx + radius * Math.sin(theta), y: cy - radius * Math.cos(theta) };
}

/** The fractional hour under a touch at (dx, dy) from the dial's centre. y grows downward, as on screen. */
export function touchHour(dx: number, dy: number): number {
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI; // (-180, 180], 0 at 12 o'clock
  return ((degrees + 360) % 360) / DEGREES_PER_HOUR;
}

/** A signed hour difference taken the short way round the clock, in [-12, 12). */
export function shortestDelta(delta: number): number {
  return ((((delta + 12) % 24) + 24) % 24) - 12;
}

/**
 * Where a handle at `current` lands when dragged to a touch at `touched`
 * (fractional hours). It moves the short way round and snaps to a whole hour, so
 * crossing midnight nudges by one hour instead of jumping the length of the ring.
 * Then it is clamped to [min, max] — the same guards the steppers use — so a
 * handle dragged past its partner stops beside it rather than inverting the window.
 */
export function dragHour(current: number, touched: number, min: number, max: number): number {
  const next = current + Math.round(shortestDelta(touched - current));
  return Math.max(min, Math.min(max, next));
}

/** The handle a touch at `touched` should pick up: whichever is nearer round the clock. */
export function nearestHandle(start: number, end: number, touched: number): 'start' | 'end' {
  const toStart = Math.abs(shortestDelta(touched - start));
  const toEnd = Math.abs(shortestDelta(touched - end));
  return toStart <= toEnd ? 'start' : 'end';
}
