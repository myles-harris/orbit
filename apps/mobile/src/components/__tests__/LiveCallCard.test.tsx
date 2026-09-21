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
  props: { timer?: React.ReactNode; onJoin?: () => void } = {},
): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <LiveCallCard groupName="Track Club" joinedCount={2} totalCount={4} timer="12:04" onJoin={() => {}} {...props} />,
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
const hostTextOf = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === 'string' ? c : hostTextOf(c))).join('');
const marigoldText = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => isHost(n, 'Text') && flat(n.props.style).color === MARIGOLD);

describe.each<Mode>(['light', 'dark'])('LiveCallCard in %s mode', (mode) => {
  it('draws the countdown, in marigold, beside the Join pill', async () => {
    const tree = await render(mode, { timer: '12:04' });

    expect(hostText(tree)).toContain('12:04');
    expect(hostText(tree)).toContain('Join');
    expect(marigoldText(tree)).toHaveLength(1); // the countdown — AC-3's text role
  });

  it('accepts a component that owns its own clock as the countdown', async () => {
    function Ticking() {
      return <>11:59</>;
    }
    const tree = await render(mode, { timer: <Ticking /> });
    expect(hostText(tree)).toContain('11:59');
  });

  // The slot is always there, whichever way the timer runs: a scheduled call counts down
  // and any other counts up, and the card is built around the element either way.
  describe('the timer slot', () => {
    const slot = (tree: ReactTestRenderer, text: string) => {
      const hit = tree.root.findAll((n) => isHost(n, 'Text') && hostTextOf(n) === text)[0];
      if (!hit) throw new Error(`no "${text}" — have: ${hostText(tree).join(' | ')}`);
      return hit;
    };

    it('is Display 28 at leading 1 in tabular figures, in marigold — the same slot the overlay draws at 52', async () => {
      const tree = await render(mode, { timer: '12:04' });

      expect(flat(slot(tree, '12:04').props.style)).toMatchObject({
        fontFamily: 'Cinzel_700Bold',
        fontSize: 28, // 28 × CAP_K 1
        lineHeight: 28, // leading 1: anything larger inflates the card
        color: MARIGOLD,
        fontVariant: ['tabular-nums'],
      });
    });

    it('is drawn in the same place, in the same style, for a count-up as for a countdown', async () => {
      const down = await render(mode, { timer: '12:04' });
      const up = await render(mode, { timer: '2:05' });

      expect(flat(slot(up, '2:05').props.style)).toEqual(flat(slot(down, '12:04').props.style));
    });

    it('sits left of the Join pill, with the row spaced apart', async () => {
      const tree = await render(mode, { timer: '2:05' });
      const bottomRow = tree.root.findByType(TouchableOpacity).parent!;

      expect(flat(bottomRow.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
      expect(hostTextOf(bottomRow.children[0] as ReactTestInstance)).toBe('2:05'); // the timer is the row's first child
    });
  });

  it('keeps the same marigold fills whichever way the timer runs: the joined band and the Join pill', async () => {
    for (const timer of ['12:04', '2:05']) {
      const tree = await render(mode, { timer });
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
