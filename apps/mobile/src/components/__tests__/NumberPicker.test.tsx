import { act } from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import NumberPicker from '../NumberPicker';
import { Icon } from '../Icon';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

async function render(
  props: Partial<React.ComponentProps<typeof NumberPicker>> = {},
  mode: Mode = 'dark',
): Promise<{ tree: ReactTestRenderer; onChange: jest.Mock }> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  const onChange = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<NumberPicker min={1} max={6} value={3} onChange={onChange} {...props} />);
  });
  return { tree, onChange };
}

const container = (tree: ReactTestRenderer) => tree.root.findByProps({ accessibilityRole: 'adjustable' });
const readoutText = (tree: ReactTestRenderer) => tree.root.findByType(Text).props.children;
const readoutBox = (tree: ReactTestRenderer) => StyleSheet.flatten(tree.root.findByType(Text).parent!.props.style);
// Pressable is memo(forwardRef(...)) in this React Native, so findAllByType(Pressable)
// misses it. Find the two by the press handler they carry, once each.
const buttons = (tree: ReactTestRenderer) => {
  const seen = new Set<unknown>();
  return tree.root
    .findAll((n) => typeof n.props.onPressIn === 'function')
    .filter((n) => !seen.has(n.props.onPressIn) && seen.add(n.props.onPressIn));
};
const act1 = (tree: ReactTestRenderer, actionName: 'increment' | 'decrement') =>
  act(() => { container(tree).props.onAccessibilityAction({ nativeEvent: { actionName } }); });

describe('NumberPicker readout', () => {
  it('shows the bare value by default', async () => {
    expect(readoutText((await render()).tree)).toBe('3');
  });

  it('shows the value with its suffix', async () => {
    expect(readoutText((await render({ value: 10, suffix: 'min' })).tree)).toBe('10 min');
  });

  it('shows a formatted value in preference to a suffix', async () => {
    const { tree } = await render({ value: 13, min: 0, max: 23, formatValue: (h) => `${h - 12} PM` });
    expect(readoutText(tree)).toBe('1 PM');
  });

  it('is 46pt wide, or 72pt for the duration — as a floor, so "10 PM" grows it rather than clipping', async () => {
    expect(readoutBox((await render()).tree)).toMatchObject({ minWidth: 46, height: 44 });
    expect(readoutBox((await render({ wide: true })).tree).minWidth).toBe(72);
  });

  it('carries a hairline above and below it, and no border at the sides', async () => {
    const box = readoutBox((await render({}, 'light')).tree);
    expect(box).toMatchObject({
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: lightTheme.colors.hairline,
    });
    expect(box.borderLeftWidth).toBeUndefined();
  });
});

describe('NumberPicker buttons', () => {
  it.each<Mode>(['light', 'dark'])('draws − and + as icons in `text`, never marigold (%s)', async (mode) => {
    const { tree } = await render({}, mode);
    const icons = tree.root.findAllByType(Icon);

    expect(icons.map((i) => i.props.name)).toEqual(['minus', 'plus']);
    expect(icons.map((i) => i.props.color)).toEqual([THEMES[mode].colors.text, THEMES[mode].colors.text]);
  });

  it('gives each a 44pt target', async () => {
    const { tree } = await render();
    expect(buttons(tree)).toHaveLength(2);
    for (const button of buttons(tree)) {
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({ width: 44, height: 44 });
    }
  });

  it('disables − at the floor and + at the ceiling, and dims them', async () => {
    const atFloor = await render({ value: 1 });
    expect(buttons(atFloor.tree)[0].props.disabled).toBe(true);
    expect(buttons(atFloor.tree)[1].props.disabled).toBe(false);
    expect(StyleSheet.flatten(buttons(atFloor.tree)[0].props.style).opacity).toBe(0.3);

    const atCeiling = await render({ value: 6 });
    expect(buttons(atCeiling.tree)[0].props.disabled).toBe(false);
    expect(buttons(atCeiling.tree)[1].props.disabled).toBe(true);
  });
});

describe('NumberPicker accessibility', () => {
  it('is one adjustable element that announces its value', async () => {
    const { tree } = await render({ value: 10, suffix: 'min' });
    expect(container(tree).props.accessible).toBe(true);
    expect(container(tree).props.accessibilityValue).toEqual({ text: '10 min' });
  });

  it('says what it sets when given a label, so "From" is not lost in a sibling Text', async () => {
    const { tree } = await render({ accessibilityLabel: 'Call duration' });
    expect(container(tree).props.accessibilityLabel).toBe('Call duration');
  });

  it('hides its − and + from the accessibility tree; the adjustable element is the way in', async () => {
    const { tree } = await render();
    expect(buttons(tree)).toHaveLength(2);
    for (const button of buttons(tree)) {
      expect(button.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });

  it('steps by one on increment and decrement', async () => {
    const { tree, onChange } = await render({ value: 3 });
    act1(tree, 'increment');
    act1(tree, 'decrement');
    expect(onChange.mock.calls.map(([v]) => v)).toEqual([4, 2]);
  });

  it('does not step past its bounds', async () => {
    const top = await render({ value: 6 });
    act1(top.tree, 'increment');
    expect(top.onChange).not.toHaveBeenCalled();

    const bottom = await render({ value: 1 });
    act1(bottom.tree, 'decrement');
    expect(bottom.onChange).not.toHaveBeenCalled();
  });
});
