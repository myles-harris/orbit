import { act } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { BottomActionBar } from '../BottomActionBar';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, layout, lightTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

async function render(
  mode: Mode,
  props: { variant?: 'primary' | 'secondary'; disabled?: boolean } = {},
): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<BottomActionBar label="New group" onPress={() => {}} {...props} />);
  });
  return tree;
}

const button = (tree: ReactTestRenderer) => StyleSheet.flatten(tree.root.findByType(TouchableOpacity).props.style);
const label = (tree: ReactTestRenderer) => StyleSheet.flatten(tree.root.findByType(Text).props.style);

describe.each<Mode>(['light', 'dark'])('BottomActionBar in %s mode', (mode) => {
  const { colors } = THEMES[mode];

  it('is the marigold button by default', async () => {
    const tree = await render(mode);
    expect(button(tree)).toMatchObject({ backgroundColor: colors.accent, minHeight: layout.primaryBtn });
    expect(label(tree).color).toBe(colors.onAccent);
  });

  it('secondary is outlined in borderStrong, not marigold', async () => {
    const tree = await render(mode, { variant: 'secondary' });
    expect(button(tree)).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      minHeight: layout.secondaryBtn,
    });
    expect(label(tree).color).toBe(colors.text);
    expect(label(tree).fontSize).toBe(16);
    expect(JSON.stringify([button(tree), label(tree)])).not.toContain(colors.accent);
  });

  it.each(['primary', 'secondary'] as const)('%s goes inert on the same track/label pair', async (variant) => {
    const tree = await render(mode, { variant, disabled: true });
    expect(button(tree).backgroundColor).toBe(colors.controlTrack);
    expect(label(tree).color).toBe(colors.textSecondary);
  });

  it('secondary keeps its height when inert, so going offline does not move the bar', async () => {
    const live = await render(mode, { variant: 'secondary' });
    const inert = await render(mode, { variant: 'secondary', disabled: true });
    expect(button(inert).minHeight).toBe(button(live).minHeight);
  });
});
