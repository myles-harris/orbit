import { act } from 'react';
import { StyleSheet } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { UserAvatar } from '../UserAvatar';
import { Display } from '../Display';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme, radius } from '../../theme';
import { allText } from '../../testUtils/tree';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  API_URL: 'http://test',
  peekAccessToken: () => null,
  getAccessToken: async () => null,
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

function render(size: number, mode: Mode = 'dark', username = 'myles'): ReactTestRenderer {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <UserAvatar userId="u1" username={username} hasAvatar={false} size={size} colors={THEMES[mode].colors} />,
    );
  });
  return tree;
}

// The fallback avatar is the surface, a strong rule, and the first letter of the name.
const frame = (tree: ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findAll((n) => (n.type as unknown) === 'View')[0].props.style);

describe('UserAvatar without a photo', () => {
  describe.each(['dark', 'light'] as const)('large, in %s mode', (mode) => {
    const { colors } = THEMES[mode];

    it('is a circle on the surface with a strong rule', () => {
      const style = frame(render(68, mode));
      expect(style).toMatchObject({
        width: 68,
        height: 68,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderStrong,
      });
    });

    it('draws the initial in the display face at 26, in the metadata colour', () => {
      const tree = render(68, mode);
      const initial = tree.root.findByType(Display);
      expect(initial.props.size).toBe(26);
      expect(initial.props.color).toBe(colors.textMeta);
      expect(allText(tree)).toEqual(['M']);
    });
  });

  it('leaves a small avatar as a rounded square with a plain bold initial', () => {
    const tree = render(36);
    expect(frame(tree).borderRadius).toBe(radius.xl);
    expect(tree.root.findAllByType(Display)).toHaveLength(0);

    const initial = tree.root.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(StyleSheet.flatten(initial.props.style)).toMatchObject({ fontWeight: '700', color: darkTheme.colors.textMeta });
  });

  it.each([[36], [68]])('takes the first letter of the trimmed name, upper-cased (size %s)', (size) => {
    expect(allText(render(size, 'dark', '  sam'))).toEqual(['S']);
  });
});
