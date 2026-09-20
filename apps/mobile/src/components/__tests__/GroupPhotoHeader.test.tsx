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
const outermost = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.type === 'string')[0];

// With no photo there is nothing to fill 300pt with. The header is the two glyphs and
// the title, and everything under it, moves up into the space.
describe('GroupPhotoHeader without a photo', () => {
  it.each<Mode>(['light', 'dark'])('is only its two glyphs — no backdrop, photo, scrim or fade (%s)', async (mode) => {
    const { tree } = await render(mode);
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(gradients(tree)).toHaveLength(0);
    expect(tree.root.findAllByType(Icon)).toHaveLength(2);
  });

  it('is no taller than its buttons — none of the 288pt of empty surface it used to draw', async () => {
    const { tree } = await render('dark');
    const heights = tree.root
      .findAll((n) => typeof n.type === 'string')
      .map((n) => StyleSheet.flatten(n.props.style)?.height)
      .filter((h): h is number => typeof h === 'number');
    expect(Math.max(...heights)).toBe(44);
    expect(StyleSheet.flatten(outermost(tree).props.style).height).toBeUndefined();
  });

  it('puts the glyphs 2pt under the status bar inset, and starts what follows 12pt below them', async () => {
    const { tree } = await render('dark');
    expect(StyleSheet.flatten(outermost(tree).props.style)).toMatchObject({
      flexDirection: 'row',
      marginTop: 47 + 2,
      marginHorizontal: 12,
      marginBottom: 12,
    });
  });

  it.each<Mode>(['light', 'dark'])('draws the glyphs in the page’s text colour, with the app’s own status bar (%s)', async (mode) => {
    (LightStatusBar as jest.Mock).mockClear();
    const { tree } = await render(mode);
    // They sit on the page background now, not on a dark surface: a light bar or cream
    // glyphs would vanish into the light theme's cream.
    expect(glyphColors(tree)).toEqual([THEMES[mode].colors.text, THEMES[mode].colors.text]);
    expect(tree.root.findAllByType(LightStatusBar)).toHaveLength(0);
  });

  it('treats an empty photo the same as none', async () => {
    const { tree } = await render('dark', '');
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(gradients(tree)).toHaveLength(0);
  });
});

describe('GroupPhotoHeader with a photo', () => {
  it.each<Mode>(['light', 'dark'])('shows the photo, cream chrome, and a light status bar in %s mode', async (mode) => {
    const { tree } = await render(mode, PHOTO);
    expect(tree.root.findByType(Image).props.source).toEqual({ uri: PHOTO });
    expect(glyphColors(tree)).toEqual([onPhoto.title, onPhoto.title]);
    expect(tree.root.findAllByType(LightStatusBar)).toHaveLength(1);
  });

  it('lays the photo over a 288pt backdrop in the surface colour, so it is not blank while it loads', async () => {
    const { tree } = await render('dark', PHOTO);
    const backdrop = tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.height === 288)[0];
    expect(StyleSheet.flatten(backdrop.props.style).backgroundColor).toBe(darkTheme.colors.surface);
    expect(backdrop.findAllByType(Image)).toHaveLength(1);
  });

  it('lays the detail scrim over the top 112pt', async () => {
    const { tree } = await render('light', PHOTO);
    const top = gradients(tree).find((g) => g.props.colors === scrim.detailHeader)!;
    expect(top).toBeDefined();
    expect(StyleSheet.flatten(top.props.style)).toMatchObject({ top: 0, height: 112 });
  });

  it('takes 300pt but hands 4 back, so the title starts at 296', async () => {
    const { tree } = await render('dark', PHOTO);
    expect(StyleSheet.flatten(outermost(tree).props.style)).toMatchObject({ height: 300, marginBottom: -4 });
  });

  it('places the buttons 2pt under the status bar inset, 12pt in from each side', async () => {
    const { tree } = await render('dark', PHOTO);
    const chrome = tree.root.findAll((n) => StyleSheet.flatten(n.props.style)?.position === 'absolute' && StyleSheet.flatten(n.props.style)?.flexDirection === 'row')[0];
    expect(StyleSheet.flatten(chrome.props.style)).toMatchObject({ top: 47 + 2, left: 12, right: 12 });
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

describe.each([
  ['a photo', PHOTO],
  ['no photo', undefined],
])('GroupPhotoHeader controls with %s', (_label, photoUri) => {
  it('wires the two glyphs to back and settings', async () => {
    const { tree, onBack, onSettings } = await render('dark', photoUri);
    const back = tree.root.findByProps({ accessibilityLabel: 'Back' });
    const settings = tree.root.findByProps({ accessibilityLabel: 'Group settings' });
    act(() => { back.props.onPress(); });
    act(() => { settings.props.onPress(); });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
