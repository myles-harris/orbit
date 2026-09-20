import { act } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';
import { LiveCallCard } from '../LiveCallCard';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;
const MARIGOLD = '#F6BF10';

async function render(
  mode: Mode,
  props: { countdown?: React.ReactNode; onJoin?: () => void } = {},
): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <LiveCallCard groupName="Track Club" joinedCount={2} totalCount={4} onJoin={() => {}} {...props} />,
    );
  });
  return tree;
}

const flat = (style: unknown): Record<string, any> =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, any>;
const isHost = (n: ReactTestInstance, name: 'Text' | 'View') => (n.type as unknown) === name;
// The rendered text, from the output: a countdown may be a component that draws its string.
const hostText = (tree: ReactTestRenderer): string[] => {
  const out: string[] = [];
  const content = (node: ReactTestRendererJSON | string): string =>
    typeof node === 'string' ? node : (node.children ?? []).map(content).join('');
  const visit = (node: ReactTestRendererJSON | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (node.type === 'Text') out.push(content(node));
    else (node.children ?? []).forEach(visit);
  };
  const json = tree.toJSON();
  (Array.isArray(json) ? json : [json]).forEach(visit);
  return out;
};
const marigoldText = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => isHost(n, 'Text') && flat(n.props.style).color === MARIGOLD);

describe.each<Mode>(['light', 'dark'])('LiveCallCard in %s mode', (mode) => {
  it('draws the countdown, in marigold, beside the Join pill', async () => {
    const tree = await render(mode, { countdown: '12:04' });

    expect(hostText(tree)).toContain('12:04');
    expect(hostText(tree)).toContain('Join');
    expect(marigoldText(tree)).toHaveLength(1); // the countdown — AC-3's text role
  });

  it('accepts a component that owns its own clock as the countdown', async () => {
    function Ticking() {
      return <>11:59</>;
    }
    const tree = await render(mode, { countdown: <Ticking /> });
    expect(hostText(tree)).toContain('11:59');
  });

  describe('without a countdown — a spontaneous call', () => {
    it('draws none, and no marigold text at all', async () => {
      const tree = await render(mode);

      expect(hostText(tree).some((t) => /^\d+:\d{2}/.test(t))).toBe(false);
      expect(marigoldText(tree)).toHaveLength(0);
    });

    it('keeps the joined band, the title and the Join pill', async () => {
      const tree = await render(mode);

      expect(hostText(tree)).toEqual(expect.arrayContaining(['2 of 4 joined', 'Track Club', 'Join']));
    });

    it('right-aligns the Join pill, which space-between would leave on the left', async () => {
      const tree = await render(mode);
      const bottomRow = tree.root.findByType(TouchableOpacity).parent!;

      expect(flat(bottomRow.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' });
    });

    it('spaces the row apart, as before, when there is a countdown', async () => {
      const tree = await render(mode, { countdown: '12:04' });
      const bottomRow = tree.root.findByType(TouchableOpacity).parent!;

      expect(flat(bottomRow.props.style).justifyContent).toBe('space-between');
    });
  });

  it('keeps the same marigold fills either way: the joined band and the Join pill', async () => {
    for (const countdown of ['12:04', undefined]) {
      const tree = await render(mode, { countdown });
      const fills = tree.root.findAll((n) => isHost(n, 'View') && flat(n.props.style).backgroundColor === MARIGOLD);
      expect(fills).toHaveLength(2);
    }
  });

  it('joins when the pill is pressed', async () => {
    const onJoin = jest.fn();
    const tree = await render(mode, { onJoin });
    await act(async () => { tree.root.findByType(TouchableOpacity).props.onPress(); });
    expect(onJoin).toHaveBeenCalledTimes(1);
  });
});
