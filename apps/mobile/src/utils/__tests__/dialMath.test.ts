import {
  arcLength,
  arcRotation,
  dragHour,
  hourAngle,
  hourPoint,
  nearestHandle,
  shortestDelta,
  touchHour,
  windowSpan,
} from '../dialMath';

// T7 — the mapping the mockup's `conic-gradient(from 90deg, #F6BF10 0 66.7%)` with
// handles at rotate(90deg) and rotate(330deg) encodes: a 24-hour clock, midnight at
// twelve o'clock, advancing clockwise.
describe('dial angle maths (T7)', () => {
  it("reproduces the mockup's own numbers for 06:00–22:00", () => {
    expect(hourAngle(6)).toBe(90);
    expect(hourAngle(22)).toBe(330);
    expect(windowSpan(6, 22)).toBe(16);
    expect(windowSpan(6, 22) / 24).toBeCloseTo(0.667, 3);
  });

  it('wraps midnight: 22:00–02:00 is four hours, not twenty or minus twenty', () => {
    expect(windowSpan(22, 2)).toBe(4);
  });

  it('puts the arc start at 3 o’clock for 06:00, and rotates it round from there', () => {
    // SVG strokes begin at 3 o'clock, which is hour 6 on this clock.
    expect(arcRotation(6)).toBe(0);
    expect(arcRotation(22)).toBe(240);
    expect(arcRotation(0)).toBe(-90);
  });

  it('draws two thirds of the ring for 16 of 24 hours', () => {
    const circumference = 2 * Math.PI * 26;
    expect(arcLength(6, 22, circumference)).toBeCloseTo((2 / 3) * circumference, 6);
    expect(arcLength(22, 2, circumference)).toBeCloseTo(circumference / 6, 6);
  });

  it('draws nothing for an empty window', () => {
    expect(arcLength(9, 9, 100)).toBe(0);
  });
});

describe('hourPoint', () => {
  const at = (hour: number) => hourPoint(hour, 30, 30, 26);

  it('puts midnight at 12 o’clock, 06:00 at 3, noon at 6, 18:00 at 9', () => {
    expect(at(0).x).toBeCloseTo(30);
    expect(at(0).y).toBeCloseTo(4);
    expect(at(6).x).toBeCloseTo(56);
    expect(at(6).y).toBeCloseTo(30);
    expect(at(12).x).toBeCloseTo(30);
    expect(at(12).y).toBeCloseTo(56);
    expect(at(18).x).toBeCloseTo(4);
    expect(at(18).y).toBeCloseTo(30);
  });
});

describe('touchHour', () => {
  it('inverts hourPoint for every whole hour', () => {
    for (let hour = 0; hour < 24; hour++) {
      const p = hourPoint(hour, 30, 30, 26);
      // Round-trip through the screen-space offset from the centre.
      expect(Math.round(touchHour(p.x - 30, p.y - 30)) % 24).toBe(hour);
    }
  });

  it('reads the four compass points', () => {
    expect(touchHour(0, -10)).toBeCloseTo(0); // up
    expect(touchHour(10, 0)).toBeCloseTo(6); // right
    expect(touchHour(0, 10)).toBeCloseTo(12); // down
    expect(touchHour(-10, 0)).toBeCloseTo(18); // left
  });
});

describe('shortestDelta', () => {
  it('takes the short way round the clock', () => {
    expect(shortestDelta(1)).toBe(1);
    expect(shortestDelta(23)).toBe(-1);
    expect(shortestDelta(-23)).toBe(1);
    expect(shortestDelta(13)).toBe(-11);
  });
});

describe('dragHour', () => {
  it('follows the finger and snaps to a whole hour', () => {
    expect(dragHour(6, 8.4, 0, 21)).toBe(8);
    expect(dragHour(6, 8.6, 0, 21)).toBe(9);
    expect(dragHour(6, 3.2, 0, 21)).toBe(3);
  });

  it('snaps to the guard rather than inverting when dragged past its partner', () => {
    // Start handle at 5, end at 8: the start's ceiling is windowStartMax(8) = 7.
    expect(dragHour(5, 9.2, 0, 7)).toBe(7);
    // End handle at 8, start at 5: the end's floor is windowEndMin(5) = 6.
    expect(dragHour(8, 3.1, 6, 23)).toBe(6);
  });

  it('does not jump the length of the ring when a handle crosses midnight', () => {
    // Start handle resting at 0, finger slides a little past 12 o'clock to 23.4.
    expect(dragHour(0, 23.4, 0, 21)).toBe(0);
    // End handle resting at 23, finger slides a little past 12 o'clock to 0.4.
    expect(dragHour(23, 0.4, 1, 23)).toBe(23);
  });

  it('leaves a handle alone when the finger is on it', () => {
    expect(dragHour(6, 6.2, 0, 21)).toBe(6);
  });
});

describe('nearestHandle', () => {
  it('picks the handle nearer round the clock', () => {
    expect(nearestHandle(6, 22, 7)).toBe('start');
    expect(nearestHandle(6, 22, 21)).toBe('end');
  });

  it('measures across midnight', () => {
    // 0 is two hours from 22 and six from 6.
    expect(nearestHandle(6, 22, 0)).toBe('end');
  });

  it('breaks an exact tie towards the start handle', () => {
    expect(nearestHandle(6, 22, 14)).toBe('start');
  });
});
