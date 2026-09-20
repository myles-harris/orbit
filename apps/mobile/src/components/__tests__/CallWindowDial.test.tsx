import { act, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { Circle } from 'react-native-svg';
import { CallWindowDial } from '../CallWindowDial';
import { useTheme } from '../../context/ThemeContext';
import { hourPoint } from '../../utils/dialMath';
import { centreTouch, dragDial, hitAreaOf, path, touchAt, DIAL_RING_RADIUS } from '../../testUtils/dial';
import { darkTheme, lightTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const CIRCUMFERENCE = 2 * Math.PI * DIAL_RING_RADIUS;

interface Spies {
  onChangeStart: jest.Mock;
  onChangeEnd: jest.Mock;
  onDragChange: jest.Mock;
}

// Holds the hours in state, as the screens do, so a handle that moves is seen to have
// moved: the dial reads its partner's latest hour through a ref, and the guards
// depend on it. The spies see only real changes.
function Harness({ initialStart, initialEnd, spies }: { initialStart: number; initialEnd: number; spies: Spies }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  return (
    <CallWindowDial
      start={start}
      end={end}
      onChangeStart={(hour) => { spies.onChangeStart(hour); setStart(hour); }}
      onChangeEnd={(hour) => { spies.onChangeEnd(hour); setEnd(hour); }}
      onDragChange={spies.onDragChange}
    />
  );
}

async function render(
  start: number,
  end: number,
  mode: Mode = 'dark',
): Promise<{ tree: ReactTestRenderer } & Spies> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  const spies = { onChangeStart: jest.fn(), onChangeEnd: jest.fn(), onDragChange: jest.fn() };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Harness initialStart={start} initialEnd={end} spies={spies} />);
  });
  return { tree, ...spies };
}

const circles = (tree: ReactTestRenderer) => tree.root.findAllByType(Circle);
// Paint order: band track, marigold arc, then the start and end handles.
const [TRACK, ARC, START_HANDLE, END_HANDLE] = [0, 1, 2, 3];

const label = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((t) => t.props.children).flat().join('');

describe('CallWindowDial rendering', () => {
  it('reproduces the mockup at 06:00–22:00: arc starts at 3 o’clock and sweeps two thirds', async () => {
    const { tree } = await render(6, 22);
    const arc = circles(tree)[ARC].props;

    expect(arc.rotation).toBe(0); // SVG's own start — 3 o'clock is hour 6
    expect(arc.strokeDasharray[0]).toBeCloseTo((2 / 3) * CIRCUMFERENCE, 6);
    expect(label(tree)).toBe('16h');
  });

  it('wraps midnight at 22:00–02:00: four hours, arc starting at 22 o’clock', async () => {
    const { tree } = await render(22, 2);
    const arc = circles(tree)[ARC].props;

    expect(arc.rotation).toBe(240); // hour 22 is 330° clockwise, less SVG's 90°
    expect(arc.strokeDasharray[0]).toBeCloseTo(CIRCUMFERENCE / 6, 6);
    expect(label(tree)).toBe('4h'); // not "20h", and not "-20h"
  });

  it('seats each handle on the band at its own hour', async () => {
    const { tree } = await render(6, 22);
    const start = hourPoint(6, 30, 30, DIAL_RING_RADIUS);
    const end = hourPoint(22, 30, 30, DIAL_RING_RADIUS);

    expect(circles(tree)[START_HANDLE].props.cx).toBeCloseTo(start.x);
    expect(circles(tree)[START_HANDLE].props.cy).toBeCloseTo(start.y);
    expect(circles(tree)[END_HANDLE].props.cx).toBeCloseTo(end.x);
    expect(circles(tree)[END_HANDLE].props.cy).toBeCloseTo(end.y);
  });

  it.each<Mode>(['light', 'dark'])('is marigold over a track, with espresso handles ringed in the page colour (%s)', async (mode) => {
    const { colors } = THEMES[mode];
    const { tree } = await render(6, 22, mode);

    expect(circles(tree)[TRACK].props.stroke).toBe(colors.controlTrack);
    expect(circles(tree)[ARC].props.stroke).toBe(colors.accent);
    for (const i of [START_HANDLE, END_HANDLE]) {
      expect(circles(tree)[i].props.fill).toBe(colors.onAccent);
      expect(circles(tree)[i].props.stroke).toBe(colors.background);
      expect(circles(tree)[i].props.strokeWidth).toBe(2);
    }
  });

  it('is out of the accessibility tree — the steppers are the accessible path', async () => {
    const { tree } = await render(6, 22);
    expect(hitAreaOf(tree.root).props.accessibilityElementsHidden).toBe(true);
    expect(hitAreaOf(tree.root).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('refuses to hand the touch back to a ScrollView once it has it', async () => {
    const { tree } = await render(6, 22);
    expect(hitAreaOf(tree.root).props.onResponderTerminationRequest()).toBe(false);
  });

  it('reaches past the 60pt ring so a fingertip can find it, without taking more layout', async () => {
    const { tree } = await render(6, 22);
    const style = StyleSheet.flatten(hitAreaOf(tree.root).props.style);
    expect(style.width).toBe(76);
    expect(style.margin).toBe(-8);
  });
});

describe('CallWindowDial picking a handle up', () => {
  it('blocks a parent ScrollView from taking the touch — the grant handler returns exactly true', async () => {
    // React Native only blocks the native responder when this returns `true`; a bare
    // return leaves an Android ScrollView free to steal the drag.
    const { tree } = await render(6, 22);
    let result: unknown;
    act(() => { result = hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    expect(result).toBe(true);
  });

  it('does not block, and does not lock anything, for a touch on the centre label', async () => {
    const { tree, onDragChange } = await render(6, 22);
    let result: unknown;
    act(() => { result = hitAreaOf(tree.root).props.onResponderGrant(centreTouch()); });

    expect(result).toBe(false);
    expect(onDragChange).not.toHaveBeenCalled();
  });

  it('moves nothing on touch-down: a tap, or a thumb brushing the ring, changes no hour', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('takes the nearer handle: the start for a touch near it, the end for one near that', async () => {
    const near = await render(6, 22);
    dragDial(near.tree.root, path(7, 9));
    expect(near.onChangeStart).toHaveBeenLastCalledWith(8);
    expect(near.onChangeEnd).not.toHaveBeenCalled();

    const far = await render(6, 22);
    dragDial(far.tree.root, path(21, 19));
    expect(far.onChangeEnd).toHaveBeenLastCalledWith(20);
    expect(far.onChangeStart).not.toHaveBeenCalled();
  });

  it('measures "nearer" across midnight', async () => {
    // Hour 0 is two hours from 22 and six from 6, so the end handle is picked up. The
    // finger then slides back across 12 o'clock to 23: one hour anticlockwise.
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    dragDial(tree.root, path(0, -1).map((h) => (h + 24) % 24));
    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).toHaveBeenLastCalledWith(21);
  });
});

describe('CallWindowDial dragging', () => {
  it('moves the handle by the angle the finger sweeps, snapped to whole hours', async () => {
    const { tree, onChangeStart } = await render(6, 22);
    dragDial(tree.root, path(8, 11));

    // Three hours swept from where the finger landed: 6 -> 9, one hour at a time.
    expect(onChangeStart.mock.calls.map(([h]) => h)).toEqual([7, 8, 9]);
  });

  it('does not jump the handle to the finger when the ring is grabbed far from it', async () => {
    const { tree, onChangeStart } = await render(6, 22);
    // Hour 14 is eight hours from each handle. The start handle is picked up, and
    // stays put through a movement too small to reach the next hour.
    const area = hitAreaOf(tree.root);
    act(() => { area.props.onResponderGrant(touchAt(14)); });
    act(() => { area.props.onResponderMove(touchAt(14.4)); });
    expect(onChangeStart).not.toHaveBeenCalled();

    // Then it moves by the sweep — two hours — not to hour 16.
    act(() => { area.props.onResponderMove(touchAt(15)); });
    act(() => { area.props.onResponderMove(touchAt(16)); });
    expect(onChangeStart).toHaveBeenLastCalledWith(8);
  });

  it('snaps to the guard rather than inverting when a handle is swept past the other', async () => {
    const { tree, onChangeStart } = await render(5, 8);
    dragDial(tree.root, path(5, 11));

    // windowStartMax(8) = 7: it stops beside the end handle and never passes it.
    expect(onChangeStart).toHaveBeenLastCalledWith(7);
    expect(onChangeStart.mock.calls.every(([h]) => h <= 7)).toBe(true);
  });

  it('holds the end handle at its own floor, one hour after the start', async () => {
    const { tree, onChangeEnd } = await render(10, 14);
    dragDial(tree.root, path(14, 3));

    // windowEndMin(10) = 11.
    expect(onChangeEnd).toHaveBeenLastCalledWith(11);
    expect(onChangeEnd.mock.calls.every(([h]) => h >= 11)).toBe(true);
  });

  it('retraces exactly: sweep past the guard and come back, and the handle follows', async () => {
    const { tree, onChangeStart } = await render(5, 8);
    // Out to hour 11 (six hours swept, pressing on the guard at 7), then back to 6.
    dragDial(tree.root, [...path(5, 11), ...path(11, 6)]);

    // Net sweep is +1, so the handle is at 6 — not stranded at 7 by the overshoot.
    expect(onChangeStart).toHaveBeenLastCalledWith(6);
  });

  it('crosses midnight without jumping the length of the ring', async () => {
    const { tree, onChangeStart } = await render(0, 22);
    // The start handle rests on midnight; the finger slides back across 12 o'clock.
    dragDial(tree.root, path(0, -1).map((h) => (h + 24) % 24));

    expect(onChangeStart).not.toHaveBeenCalled(); // 0 is its floor: nowhere to go, and no leap to 21
  });

  it('does not follow the finger through the centre, where the angle flips', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    const area = hitAreaOf(tree.root);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    // Straight across the dial: a twelve-hour jump in one event.
    act(() => { area.props.onResponderMove(touchAt(20)); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('picks a handle afresh for each touch', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    dragDial(tree.root, path(7, 9));
    dragDial(tree.root, path(21, 19));

    expect(onChangeStart).toHaveBeenLastCalledWith(8);
    expect(onChangeEnd).toHaveBeenLastCalledWith(20);
  });

  it('moves nothing on a move that arrives after the touch was taken away', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    const area = hitAreaOf(tree.root);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    act(() => { area.props.onResponderTerminate(); });
    act(() => { area.props.onResponderMove(touchAt(12)); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });
});

// The screens use this to stop their ScrollView scrolling mid-drag — the belt to the
// grant handler's braces, and the only protection where React Native does not block
// a parent (its docs say blocking is Android-only).
describe('CallWindowDial drag state', () => {
  it('reports true when a handle is picked up and false when the finger lets go', async () => {
    const { tree, onDragChange } = await render(6, 22);
    const area = hitAreaOf(tree.root);

    act(() => { area.props.onResponderGrant(touchAt(8)); });
    expect(onDragChange).toHaveBeenLastCalledWith(true);
    act(() => { area.props.onResponderRelease(); });
    expect(onDragChange).toHaveBeenLastCalledWith(false);
    expect(onDragChange).toHaveBeenCalledTimes(2);
  });

  it('reports false when React Native takes the touch away, too', async () => {
    const { tree, onDragChange } = await render(6, 22);
    const area = hitAreaOf(tree.root);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    act(() => { area.props.onResponderTerminate(); });

    expect(onDragChange.mock.calls.map(([d]) => d)).toEqual([true, false]);
  });

  it('reports a release once, however many times it is told', async () => {
    const { tree, onDragChange } = await render(6, 22);
    const area = hitAreaOf(tree.root);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    act(() => { area.props.onResponderRelease(); });
    act(() => { area.props.onResponderTerminate(); });

    expect(onDragChange.mock.calls.map(([d]) => d)).toEqual([true, false]);
  });

  it('does not leave its screen locked if it unmounts mid-drag', async () => {
    const { tree, onDragChange } = await render(6, 22);
    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    act(() => { tree.unmount(); });

    expect(onDragChange).toHaveBeenLastCalledWith(false);
  });

  it('is optional', async () => {
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<CallWindowDial start={6} end={22} onChangeStart={jest.fn()} onChangeEnd={jest.fn()} />);
    });
    expect(() => {
      dragDial(tree.root, path(7, 9));
    }).not.toThrow();
  });
});
