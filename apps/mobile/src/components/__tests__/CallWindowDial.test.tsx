import { act } from 'react';
import { StyleSheet, Text, type GestureResponderEvent } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Circle } from 'react-native-svg';
import { CallWindowDial } from '../CallWindowDial';
import { useTheme } from '../../context/ThemeContext';
import { hourPoint } from '../../utils/dialMath';
import { darkTheme, lightTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

// Mirrors the component's own geometry: a 60pt ring with 8pt of touch padding.
const RING_RADIUS = 26;
const HIT_CENTER = 38;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface Handlers {
  onChangeStart: jest.Mock;
  onChangeEnd: jest.Mock;
}

async function render(
  start: number,
  end: number,
  mode: Mode = 'dark',
): Promise<{ tree: ReactTestRenderer } & Handlers> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  const handlers = { onChangeStart: jest.fn(), onChangeEnd: jest.fn() };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<CallWindowDial start={start} end={end} {...handlers} />);
  });
  return { tree, ...handlers };
}

const circles = (tree: ReactTestRenderer) => tree.root.findAllByType(Circle);
// Paint order: band track, marigold arc, then the start and end handles.
const [TRACK, ARC, START_HANDLE, END_HANDLE] = [0, 1, 2, 3];

const hitArea = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll((n) => typeof n.props.onResponderGrant === 'function')[0];

/** A touch on the ring at `hour`, as the responder system reports it. */
const touchAt = (hour: number): GestureResponderEvent => {
  const p = hourPoint(hour, HIT_CENTER, HIT_CENTER, RING_RADIUS);
  return { nativeEvent: { locationX: p.x, locationY: p.y } } as GestureResponderEvent;
};

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
    const start = hourPoint(6, 30, 30, RING_RADIUS);
    const end = hourPoint(22, 30, 30, RING_RADIUS);

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
    expect(hitArea(tree).props.accessibilityElementsHidden).toBe(true);
    expect(hitArea(tree).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('refuses to hand the touch back to a ScrollView once it has it', async () => {
    const { tree } = await render(6, 22);
    expect(hitArea(tree).props.onResponderTerminationRequest()).toBe(false);
  });

  it('reaches past the 60pt ring so a fingertip can find it, without taking more layout', async () => {
    const { tree } = await render(6, 22);
    const style = StyleSheet.flatten(hitArea(tree).props.style);
    expect(style.width).toBe(76);
    expect(style.margin).toBe(-8);
  });
});

describe('CallWindowDial dragging', () => {
  it('picks up the handle nearest the touch and follows the finger, snapped to the hour', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    act(() => { hitArea(tree).props.onResponderGrant(touchAt(8)); });

    expect(onChangeStart).toHaveBeenCalledWith(8);
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('picks up the end handle when the touch is nearer it', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    act(() => { hitArea(tree).props.onResponderGrant(touchAt(20)); });

    expect(onChangeEnd).toHaveBeenCalledWith(20);
    expect(onChangeStart).not.toHaveBeenCalled();
  });

  it('keeps the same handle for the whole drag, however close the other one is', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 9);
    const area = hitArea(tree);
    act(() => { area.props.onResponderGrant(touchAt(6)); });
    // Finger slides over the end handle's hour; the start handle is still the one held.
    act(() => { area.props.onResponderMove(touchAt(9)); });

    expect(onChangeEnd).not.toHaveBeenCalled();
    expect(onChangeStart).toHaveBeenLastCalledWith(8); // stops beside the end handle, not on it
  });

  it('snaps to the guard rather than inverting when a handle is dragged past the other', async () => {
    const { tree, onChangeStart } = await render(5, 8);
    const area = hitArea(tree);
    act(() => { area.props.onResponderGrant(touchAt(5)); });
    act(() => { area.props.onResponderMove(touchAt(11)); });

    // windowStartMax(8) = 7: never 11, and never past the end handle.
    expect(onChangeStart).toHaveBeenLastCalledWith(7);
  });

  it('holds the end handle at its own floor, one hour after the start', async () => {
    const { tree, onChangeEnd } = await render(10, 14);
    const area = hitArea(tree);
    act(() => { area.props.onResponderGrant(touchAt(14)); });
    act(() => { area.props.onResponderMove(touchAt(3)); });

    // windowEndMin(10) = 11.
    expect(onChangeEnd).toHaveBeenLastCalledWith(11);
  });

  it('does not report a change when the handle is already where the finger is', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    act(() => { hitArea(tree).props.onResponderGrant(touchAt(6)); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('ignores a touch on the centre label, where an angle means nothing', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    const centre = { nativeEvent: { locationX: HIT_CENTER + 1, locationY: HIT_CENTER - 1 } } as GestureResponderEvent;
    act(() => { hitArea(tree).props.onResponderGrant(centre); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('lets go on release, so the next touch picks a handle afresh', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    const area = hitArea(tree);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    act(() => { area.props.onResponderRelease(); });
    act(() => { area.props.onResponderGrant(touchAt(20)); });

    expect(onChangeStart).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(20);
  });

  it('moves nothing on a move event that arrives after the touch was taken away', async () => {
    const { tree, onChangeStart, onChangeEnd } = await render(6, 22);
    const area = hitArea(tree);
    act(() => { area.props.onResponderGrant(touchAt(8)); });
    onChangeStart.mockClear();
    act(() => { area.props.onResponderTerminate(); });
    act(() => { area.props.onResponderMove(touchAt(12)); });

    expect(onChangeStart).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });
});
