import { act } from 'react';
import { StyleSheet } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { LinearGradient } from 'expo-linear-gradient';
import { GroupTile } from '../GroupTile';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme, scrim } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const PHOTO = 'https://example.com/group-photo.jpg';
const WHEAT = '#E2C48D'; // the design's fixed over-photo sub-label colour

async function render(
  mode: Mode,
  props: { photoUri?: string | null; subLabel?: string } = {},
): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <GroupTile name="Track Club" cadence="Daily" onPress={() => {}} {...props} />,
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
  const cases: [string, Mode, { photoUri?: string; subLabel: string }][] = [
    ['photo / light', 'light', { photoUri: PHOTO, subLabel: 'call ended 4 minutes ago' }],
    ['photo / dark', 'dark', { photoUri: PHOTO, subLabel: 'call ended 4 minutes ago' }],
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
    const tree = await render(mode, { photoUri: PHOTO, subLabel: 'call ended 4 minutes ago' });
    expect(textColor(tree, 'call ended 4 minutes ago')).toBe(WHEAT);
  });

  it.each<Mode>(['light', 'dark'])('is textSecondary on a surface tile in %s mode', async (mode) => {
    const tree = await render(mode, { subLabel: 'muted' });
    const color = textColor(tree, 'muted');
    expect(color).toBe(THEMES[mode].colors.textSecondary);
    expect(color).not.toBe(WHEAT);
  });

  it('renders no subLabel node when none is given', async () => {
    const tree = await render('light', { photoUri: PHOTO });
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
    const tree = await render('dark', { photoUri: PHOTO });
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
