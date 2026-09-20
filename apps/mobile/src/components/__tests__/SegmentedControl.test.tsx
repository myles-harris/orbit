import { act } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { SegmentedControl } from '../SegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme, radius } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const;

async function render(mode: Mode, value: 'daily' | 'weekly', onChange = jest.fn()): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<SegmentedControl options={[...OPTIONS]} value={value} onChange={onChange} />);
  });
  return tree;
}

const items = (tree: ReactTestRenderer) => tree.root.findAllByType(TouchableOpacity);
const itemStyle = (tree: ReactTestRenderer, i: number) => StyleSheet.flatten(items(tree)[i].props.style);
const labelStyle = (tree: ReactTestRenderer, i: number) => StyleSheet.flatten(items(tree)[i].findByType(Text).props.style);

describe.each<Mode>(['light', 'dark'])('SegmentedControl in %s mode', (mode) => {
  const { colors, shadow } = THEMES[mode];

  it('draws a controlTrack well with 3pt of padding', async () => {
    const tree = await render(mode, 'daily');
    const track = tree.root.findByProps({ accessibilityRole: 'tablist' });
    expect(StyleSheet.flatten(track.props.style)).toMatchObject({
      backgroundColor: colors.controlTrack,
      padding: 3,
      borderRadius: radius.lg,
    });
  });

  it('lifts the active item as a surface pill carrying shadow.card', async () => {
    const tree = await render(mode, 'weekly');
    expect(itemStyle(tree, 1)).toMatchObject({
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      ...shadow.card,
    });
    expect(itemStyle(tree, 0).backgroundColor).toBeUndefined();
  });

  it('keeps items at least 38pt tall, so large text grows them rather than clipping', async () => {
    const tree = await render(mode, 'daily');
    expect(itemStyle(tree, 0).minHeight).toBe(38);
  });

  // textSecondary on the track is 3.78:1 in dark; an unselected segment is still
  // operable, so it can't lean on the inactive-control exemption.
  it('sets both labels in text, so neither falls below AA on the track', async () => {
    const tree = await render(mode, 'daily');
    expect(labelStyle(tree, 0).color).toBe(colors.text);
    expect(labelStyle(tree, 1).color).toBe(colors.text);
  });

  it('carries the selection in the pill and the weight instead: 600 active, 500 not', async () => {
    const tree = await render(mode, 'daily');
    expect(labelStyle(tree, 0).fontFamily).toBe('Geist_600SemiBold');
    expect(labelStyle(tree, 1).fontFamily).toBe('Geist_500Medium');
  });

  it('never uses marigold — it is reserved', async () => {
    const tree = await render(mode, 'daily');
    expect(JSON.stringify(tree.toJSON())).not.toContain(colors.accent);
  });
});

describe('SegmentedControl behaviour', () => {
  it('reports the value of the item pressed', async () => {
    const onChange = jest.fn();
    const tree = await render('dark', 'daily', onChange);
    act(() => { items(tree)[1].props.onPress(); });
    expect(onChange).toHaveBeenCalledWith('weekly');
  });

  it('announces itself as a tab list with the active tab selected', async () => {
    const tree = await render('dark', 'weekly');
    expect(items(tree).map((i) => i.props.accessibilityRole)).toEqual(['tab', 'tab']);
    expect(items(tree).map((i) => i.props.accessibilityState)).toEqual([{ selected: false }, { selected: true }]);
  });
});
