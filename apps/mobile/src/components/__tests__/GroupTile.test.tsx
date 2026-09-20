import { act } from 'react';
import { Image, StyleSheet, TouchableOpacity } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';
import { GroupTile } from '../GroupTile';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, layout, lightTheme, onPhoto, scrim } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  API_URL: 'http://test',
  peekAccessToken: jest.fn(() => 'tok'),
  getAccessToken: jest.fn(async () => 'tok'),
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const STAMP = '2026-09-01T12:00:00.000Z';
const WHEAT = '#E2C48D'; // the design's fixed over-photo sub-label colour

async function render(
  mode: Mode,
  props: { hasPhoto?: boolean; subLabel?: string; live?: boolean } = {},
): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupTile
        name="Track Club"
        cadence="Daily"
        groupId="g1"
        photoUpdatedAt={STAMP}
        onPress={() => {}}
        {...props}
      />,
    );
  });
  return tree;
}

// The host <Text> node carrying `text` — its resolved style is what reaches the screen.
function textColor(tree: ReactTestRenderer, text: string): string | undefined {
  const node = tree.root.findAll(
    (n: ReactTestInstance) => typeof n.type === 'string' && n.props.children === text,
  )[0];
  return StyleSheet.flatten(node.props.style)?.color as string | undefined;
}

// T4 — one snapshot per state the tile can be in. Every state carries a subLabel,
// so all three slots (name, subLabel, cadence) are covered in each.
describe('GroupTile snapshots (T4)', () => {
  const cases: [string, Mode, { hasPhoto?: boolean; subLabel: string }][] = [
    ['photo / light', 'light', { hasPhoto: true, subLabel: 'call ended 4 minutes ago' }],
    ['photo / dark', 'dark', { hasPhoto: true, subLabel: 'call ended 4 minutes ago' }],
    ['no photo / light', 'light', { subLabel: 'muted' }],
    ['no photo / dark', 'dark', { subLabel: 'muted' }],
  ];

  it.each(cases)('%s', async (_label, mode, props) => {
    const tree = await render(mode, props);
    expect(tree.toJSON()).toMatchSnapshot();
  });
});

// T5 — the subLabel is wheat over a photo and textSecondary on a surface tile.
describe('GroupTile subLabel colour (T5)', () => {
  it.each<Mode>(['light', 'dark'])('is wheat over a photo in %s mode', async (mode) => {
    const tree = await render(mode, { hasPhoto: true, subLabel: 'call ended 4 minutes ago' });
    expect(textColor(tree, 'call ended 4 minutes ago')).toBe(WHEAT);
  });

  it.each<Mode>(['light', 'dark'])('is textSecondary on a surface tile in %s mode', async (mode) => {
    const tree = await render(mode, { subLabel: 'muted' });
    const color = textColor(tree, 'muted');
    expect(color).toBe(THEMES[mode].colors.textSecondary);
    expect(color).not.toBe(WHEAT);
  });

  it('renders no subLabel node when none is given', async () => {
    const tree = await render('light', { hasPhoto: true });
    const stray = tree.root.findAll(
      (n: ReactTestInstance) => typeof n.type === 'string' && n.props.children === 'muted',
    );
    expect(stray).toHaveLength(0);
  });
});

// Guards the two-scrim stack: tileTop darkens from the top edge down, tileBottom
// from the bottom edge up. expo-linear-gradient defaults to top→bottom, so a
// bottom-anchored scrim with no start/end silently darkens the wrong edge.
describe('GroupTile scrims', () => {
  it('stacks tileTop from the top and tileBottom from the bottom over a photo', async () => {
    const tree = await render('dark', { hasPhoto: true });
    const gradients = tree.root.findAllByType(LinearGradient);
    expect(gradients).toHaveLength(2);

    const [top, bottom] = gradients;
    expect(top.props.colors).toEqual(scrim.tileTop);
    expect(top.props.start).toBeUndefined(); // default: top → bottom
    expect(bottom.props.colors).toEqual(scrim.tileBottom);
    expect(bottom.props.start).toEqual({ x: 0.5, y: 1 });
    expect(bottom.props.end).toEqual({ x: 0.5, y: 0 });
  });

  it('draws no scrim on a surface tile', async () => {
    const tree = await render('dark');
    expect(tree.root.findAllByType(LinearGradient)).toHaveLength(0);
  });
});

const MARIGOLD = '#F6BF10';

// A second concurrent live call: the hero card takes the first, and any other
// live group keeps its tile with a 1px marigold border and a "live" label.
describe('GroupTile live (concurrent call)', () => {
  const border = (tree: ReactTestRenderer) => {
    const style = StyleSheet.flatten(tree.root.findByType(TouchableOpacity).props.style);
    return { width: style.borderWidth, color: style.borderColor };
  };

  it.each<Mode>(['light', 'dark'])('is unmarked when not live, in %s mode', async (mode) => {
    const tree = await render(mode);
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'live')).toHaveLength(0);
    expect(border(tree)).toEqual({ width: 1, color: THEMES[mode].colors.hairline });
  });

  it.each<[Mode, boolean]>([
    ['light', false],
    ['light', true],
    ['dark', false],
    ['dark', true],
  ])('draws a 1px marigold border in %s mode (photo: %s)', async (mode, hasPhoto) => {
    const tree = await render(mode, { live: true, hasPhoto });
    expect(border(tree)).toEqual({ width: 1, color: MARIGOLD });
  });

  it.each<Mode>(['light', 'dark'])('labels a photo tile in marigold over the scrim in %s mode', async (mode) => {
    const tree = await render(mode, { live: true, hasPhoto: true });
    expect(textColor(tree, 'live')).toBe(onPhoto.accent);
  });

  it('labels a dark surface tile in marigold — 8.96:1 on the dark surface', async () => {
    const tree = await render('dark', { live: true });
    expect(textColor(tree, 'live')).toBe(MARIGOLD);
  });

  it('does not put marigold text on the light surface, where it is 1.60:1', async () => {
    const tree = await render('light', { live: true });
    expect(textColor(tree, 'live')).toBe(lightTheme.colors.text);
    expect(textColor(tree, 'live')).not.toBe(MARIGOLD);
  });

  // The label must not join the tile's space-between flow, or the name and cadence
  // slots move: it is pinned to the bottom-left corner, out of flow.
  it('pins the label out of flow, in the bottom-left corner, so the other slots do not move', async () => {
    const tree = await render('dark', { subLabel: 'muted', live: true });
    const label = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'live')[0];
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      position: 'absolute',
      left: layout.tilePad,
      bottom: layout.tilePad,
    });

    // The name, sub-label and cadence still render, coloured as on a plain tile.
    const plain = await render('dark', { subLabel: 'muted' });
    ['Track Club', 'muted', 'Daily'].forEach((text) => {
      expect(textColor(tree, text)).toBe(textColor(plain, text));
    });
  });

  it('keeps the name, sub-label and cadence in flow', async () => {
    const tree = await render('dark', { subLabel: 'muted', live: true });
    ['Track Club', 'muted', 'Daily'].forEach((text) => {
      const node = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === text)[0];
      expect(StyleSheet.flatten(node.props.style)?.position).not.toBe('absolute');
    });
  });
});

// The photo is behind the group's membership check, so the tile fetches it with the
// token and falls back to the designed no-photo tile when it cannot.
describe('GroupTile photo fetch', () => {
  it("fetches the group's versioned photo URL with the bearer token", async () => {
    const tree = await render('dark', { hasPhoto: true });
    expect(tree.root.findByType(Image).props.source).toEqual({
      uri: `http://test/groups/g1/photo?v=${Date.parse(STAMP)}`,
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('draws the surface tile and requests no image when the group has no photo', async () => {
    const tree = await render('dark', { hasPhoto: false });
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findAllByType(LinearGradient)).toHaveLength(0);
    expect(textColor(tree, 'Track Club')).toBe(darkTheme.colors.text);
  });

  it('falls back to the designed no-photo tile when the image cannot be loaded', async () => {
    const tree = await render('dark', { hasPhoto: true });
    expect(tree.root.findAllByType(Image)).toHaveLength(1);

    // The token has not changed since mount, so there is nothing to retry with.
    await act(async () => { await tree.root.findByType(Image).props.onError(); });

    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    expect(tree.root.findAllByType(LinearGradient)).toHaveLength(0);
    expect(textColor(tree, 'Track Club')).toBe(darkTheme.colors.text); // not the over-photo cream
  });
});
