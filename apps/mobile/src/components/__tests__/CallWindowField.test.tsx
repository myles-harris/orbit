import { act } from 'react';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { CallWindowField, WindowPreview } from '../CallWindowField';
import { useTheme } from '../../context/ThemeContext';
import { windowPreviewLines } from '../../utils/windowPreview';
import { allText, stepperShowing } from '../../testUtils/tree';
import { hitAreaOf, touchAt } from '../../testUtils/dial';
import { darkTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
// A pass-through spy: the real lines, and a count of how many times they were computed.
jest.mock('../../utils/windowPreview', () => {
  const actual = jest.requireActual('../../utils/windowPreview');
  return { ...actual, windowPreviewLines: jest.fn(actual.windowPreviewLines) };
});

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';

beforeEach(() => {
  jest.clearAllMocks();
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
});

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

describe('WindowPreview', () => {
  it('draws the group’s zone first, then one line per other zone', async () => {
    const tree = await mount(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={[LA, LONDON, LA]} />);
    const lines = allText(tree);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`${NY} · 6 AM – 10 PM · group`);
    expect(lines.filter((l) => l.startsWith(LA))).toHaveLength(1);
  });

  // Each zone line builds two Intl.DateTimeFormats, and a drag re-renders this once per
  // hour step — so it must not recompute for a re-render that changed nothing.
  it('does not recompute the lines for a re-render with the same inputs', async () => {
    const zones = [LA, LONDON];
    const tree = await mount(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={zones} />);
    expect(windowPreviewLines).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.update(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={zones} />);
    });
    expect(windowPreviewLines).toHaveBeenCalledTimes(1);
  });

  it('recomputes when the window moves', async () => {
    const zones = [LA];
    const tree = await mount(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={zones} />);
    await act(async () => {
      tree.update(<WindowPreview start={6} end={21} groupTz={NY} memberTimeZones={zones} />);
    });

    expect(windowPreviewLines).toHaveBeenCalledTimes(2);
    expect(allText(tree)[0]).toBe(`${NY} · 6 AM – 9 PM · group`);
  });

  it('recomputes when the zones change', async () => {
    const tree = await mount(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={[LA]} />);
    await act(async () => {
      tree.update(<WindowPreview start={6} end={22} groupTz={NY} memberTimeZones={[LA, LONDON]} />);
    });

    expect(windowPreviewLines).toHaveBeenCalledTimes(2);
    expect(allText(tree)).toHaveLength(3);
  });
});

describe('CallWindowField', () => {
  const field = (extra: Partial<React.ComponentProps<typeof CallWindowField>> = {}) => (
    <CallWindowField
      start={6}
      end={22}
      onChangeStart={jest.fn()}
      onChangeEnd={jest.fn()}
      groupTz={NY}
      memberTimeZones={[NY, LA]}
      {...extra}
    />
  );

  it('is labelled "Call window", and explains itself', async () => {
    const tree = await mount(field());
    const text = allText(tree);
    expect(text).toContain('Call window');
    expect(text).toContain("Calls are scheduled at a random time within this window, in the group's timezone.");
  });

  it('labels the two steppers for a screen reader, and clamps each by the other’s hour', async () => {
    const tree = await mount(field());
    const from = stepperShowing(tree, '6 AM');
    const until = stepperShowing(tree, '10 PM');

    expect(from.props.accessibilityLabel).toBe('From');
    expect(until.props.accessibilityLabel).toBe('Until');
    expect(from.props.max).toBe(21); // windowStartMax(22)
    expect(until.props.min).toBe(7); // windowEndMin(6)
  });

  it('routes the steppers to the right callbacks', async () => {
    const onChangeStart = jest.fn();
    const onChangeEnd = jest.fn();
    const tree = await mount(field({ onChangeStart, onChangeEnd }));
    act(() => { stepperShowing(tree, '6 AM').props.onChange(7); });
    act(() => { stepperShowing(tree, '10 PM').props.onChange(21); });

    expect(onChangeStart).toHaveBeenCalledWith(7);
    expect(onChangeEnd).toHaveBeenCalledWith(21);
  });

  it('tells its parent when a handle is held and when it is let go', async () => {
    const onDragChange = jest.fn();
    const tree = await mount(field({ onDragChange }));
    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    act(() => { hitAreaOf(tree.root).props.onResponderRelease(); });

    expect(onDragChange.mock.calls.map(([dragging]) => dragging)).toEqual([true, false]);
  });

  it('draws the zone preview beneath the controls', async () => {
    const tree = await mount(field());
    const text = allText(tree);
    expect(text).toContain(`${NY} · 6 AM – 10 PM · group`);
    expect(text.findIndex((t) => t.startsWith(LA))).toBeGreaterThan(text.indexOf('Until'));
  });
});
