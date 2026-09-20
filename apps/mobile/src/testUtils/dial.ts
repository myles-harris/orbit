// Drives a CallWindowDial the way the responder system does: through the props the
// View carries, with the locationX/Y a real touch would report. Deliberately outside
// `__tests__`, which jest collects as suites.
import { act } from 'react';
import type { GestureResponderEvent } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { CallWindowDial } from '../components/CallWindowDial';
import { hourPoint } from '../utils/dialMath';

// Mirrors CallWindowDial's geometry: a 60pt ring (26pt to its band's centre line)
// inside a touch area with 8pt of reach on every side. If the component's geometry
// changes, its own tests fail loudly until this follows.
const DIAL_HIT_CENTER = 38;
export const DIAL_RING_RADIUS = 26;

/** A touch on the ring at `hour`, as the responder system reports it. */
export function touchAt(hour: number): GestureResponderEvent {
  const p = hourPoint(hour, DIAL_HIT_CENTER, DIAL_HIT_CENTER, DIAL_RING_RADIUS);
  return { nativeEvent: { locationX: p.x, locationY: p.y } } as GestureResponderEvent;
}

/** A touch on the dial's centre label, where an angle means nothing. */
export const centreTouch = (): GestureResponderEvent =>
  ({ nativeEvent: { locationX: DIAL_HIT_CENTER + 1, locationY: DIAL_HIT_CENTER - 1 } }) as GestureResponderEvent;

/**
 * The dial's touch area: the View carrying its responder props. Scoped to the dial —
 * on a whole screen, the first node with an `onResponderGrant` is some button's.
 */
export const hitAreaOf = (root: ReactTestInstance): ReactTestInstance =>
  root.findByType(CallWindowDial).findAll((n) => typeof n.props.onResponderGrant === 'function')[0];

/**
 * The hours a finger passes through going from `from` to `to`, every half hour.
 * A real drag delivers many small moves, not one jump.
 */
export function path(from: number, to: number, step = 0.5): number[] {
  const hours = [from];
  const direction = to >= from ? 1 : -1;
  for (let h = from + direction * step; direction * (to - h) > -1e-9; h += direction * step) hours.push(h);
  return hours;
}

/** A finger down at the first hour, sliding through the rest, then lifting. */
export function dragDial(root: ReactTestInstance, hours: number[]): void {
  const area = hitAreaOf(root);
  act(() => { area.props.onResponderGrant(touchAt(hours[0])); });
  for (const hour of hours.slice(1)) act(() => { area.props.onResponderMove(touchAt(hour)); });
  act(() => { area.props.onResponderRelease(); });
}
