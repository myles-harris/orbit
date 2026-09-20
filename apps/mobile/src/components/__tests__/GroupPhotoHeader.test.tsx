import { act } from 'react';
import { Image, StyleSheet } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';
import { GroupPhotoHeader } from '../GroupPhotoHeader';
import { Icon } from '../Icon';
import { LightStatusBar } from '../LightStatusBar';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme, onPhoto, scrim } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../LightStatusBar', () => ({ LightStatusBar: jest.fn(() => null) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;
const PHOTO = 'https://example.com/group-photo.jpg';

async function render(mode: Mode, photoUri?: string | null, handlers = { onBack: jest.fn(), onSettings: jest.fn() }) {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GroupPhotoHeader photoUri={photoUri} {...handlers} />);
  });
  return { tree, ...handlers };
}

const glyphColors = (tree: ReactTestRenderer) => tree.root.findAllByType(Icon).map((i) => i.props.color);
const gradients = (tree: ReactTestRenderer) => tree.root.findAllByType(LinearGradient);

describe('GroupPhotoHeader without a photo', () => {
  it('fills the 288pt backdrop with the surface colour', async () => {
    const { tree } = await render('dark');
    const backdrop = tree.root.findAll((n) => {
      const s = StyleSheet.flatten(n.props.style);
      return typeof n.type === 'string' && s?.height === 288;
    })[0];
    expect(StyleSheet.flatten(backdrop.props.style).backgroundColor).toBe(darkTheme.colors.surface);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('is cream chrome and a light status bar on the dark theme’s surface', async () => {
    (LightStatusBar as jest.Mock).mockClear();
    const { tree } = await render('dark');
    expect(glyphColors(tree)).toEqual([onPhoto.title, onPhoto.title]);
    expect(tree.root.findAllByType(LightStatusBar)).toHaveLength(1);
  });

  it('is text-coloured chrome on the light theme’s white surface, where cream would be ~1.05:1', async () => {
    const { tree } = await render('light');
    expect(glyphColors(tree)).toEqual([lightTheme.colors.text, lightTheme.colors.text]);
    // The app's own theme-following bar stays; a light one would vanish into the cream.
    expect(tree.root.findAllByType(LightStatusBar)).toHaveLength(0);
  });

  it('draws no top scrim — it would only smudge a plain surface', async () => {
    const { tree } = await render('dark');
    expect(gradients(tree).map((g) => g.props.colors)).not.toContainEqual(scrim.detailHeader);
  });
});

describe('GroupPhotoHeader with a photo', () => {
  it.each<Mode>(['light', 'dark'])('shows the photo, cream chrome, and a light status bar in %s mode', async (mode) => {
    const { tree } = await render(mode, PHOTO);
    expect(tree.root.findByType(Image).props.source).toEqual({ uri: PHOTO });
    expect(glyphColors(tree)).toEqual([onPhoto.title, onPhoto.title]);
    expect(tree.root.findAllByType(LightStatusBar)).toHaveLength(1);
  });

  it('lays the detail scrim over the top 112pt', async () => {
    const { tree } = await render('light', PHOTO);
    const top = gradients(tree).find((g) => g.props.colors === scrim.detailHeader)!;
    expect(top).toBeDefined();
    expect(StyleSheet.flatten(top.props.style)).toMatchObject({ top: 0, height: 112 });
  });
});

describe.each<Mode>(['light', 'dark'])('GroupPhotoHeader fade in %s mode', (mode) => {
  it('dissolves into the page colour from 208 to 300, through its own clear end, not "transparent"', async () => {
    const { colors } = THEMES[mode];
    const { tree } = await render(mode, PHOTO);
    const fade = gradients(tree).find((g) => g.props.colors[1] === colors.background)!;

    expect(fade.props.colors).toEqual([colors.backgroundClear, colors.background]);
    expect(StyleSheet.flatten(fade.props.style)).toMatchObject({ top: 208, height: 92 });
  });
});

describe('GroupPhotoHeader geometry and controls', () => {
  it('takes 300pt but hands 4 back, so the title starts at 296', async () => {
    const { tree } = await render('dark');
    const outermost = tree.root.findAll((n) => typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(outermost.props.style)).toMatchObject({ height: 300, marginBottom: -4 });
  });

  it('places the buttons 2pt under the status bar inset, 12pt in from each side', async () => {
    const { tree } = await render('dark');
    const chrome = tree.root.findAll((n) => StyleSheet.flatten(n.props.style)?.position === 'absolute' && StyleSheet.flatten(n.props.style)?.flexDirection === 'row')[0];
    expect(StyleSheet.flatten(chrome.props.style)).toMatchObject({ top: 47 + 2, left: 12, right: 12 });
  });

  it('wires the two glyphs to back and settings', async () => {
    const { tree, onBack, onSettings } = await render('dark');
    const back = tree.root.findByProps({ accessibilityLabel: 'Back' });
    const settings = tree.root.findByProps({ accessibilityLabel: 'Group settings' });
    act(() => { back.props.onPress(); });
    act(() => { settings.props.onPress(); });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
