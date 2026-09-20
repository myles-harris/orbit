import { act } from 'react';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, type IconName } from '../Icon';

// Typed as a Record so adding or removing an icon in Icon.tsx is a compile error
// here until this table follows — the set can't drift silently. The value is
// whether the glyph carries a <Circle> alongside its path (Appendix D).
const HAS_CIRCLE: Record<IconName, boolean> = {
  'chevron-left': false,
  'chevron-right': false,
  'chevron-up': false,
  check: false,
  minus: false,
  plus: false,
  settings: true,
  camera: true,
  share: false,
  trash: false,
  sun: true,
  moon: false,
  'wifi-off': false,
};

const NAMES = Object.keys(HAS_CIRCLE) as IconName[];

async function render(name: IconName, size?: number): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Icon name={name} size={size} color="#123456" />);
  });
  return tree;
}

describe('Icon', () => {
  it('ships the thirteen icons from the design', () => {
    expect(NAMES).toHaveLength(13);
  });

  it.each(NAMES)('%s draws one stroked, unfilled path on a 24×24 viewBox', async (name) => {
    const tree = await render(name);
    const svg = tree.root.findByType(Svg);
    expect(svg.props.viewBox).toBe('0 0 24 24');
    expect(svg.props.fill).toBe('none');

    const path = tree.root.findByType(Path);
    expect(path.props.d).toEqual(expect.any(String));
    expect(path.props.d.length).toBeGreaterThan(0);
    expect(path.props.stroke).toBe('#123456');
    expect(path.props.strokeWidth).toBe(2);
    expect(path.props.strokeLinecap).toBe('round');
    expect(path.props.strokeLinejoin).toBe('round');
  });

  it.each(NAMES)('%s has a circle only where the design draws one', async (name) => {
    const tree = await render(name);
    expect(tree.root.findAllByType(Circle)).toHaveLength(HAS_CIRCLE[name] ? 1 : 0);
  });

  // The two sizes the brief calls out: 22 (nav) and 12 (badges).
  it.each([22, 12])('renders at %ipt', async (size) => {
    const tree = await render('settings', size);
    const svg = tree.root.findByType(Svg);
    expect(svg.props.width).toBe(size);
    expect(svg.props.height).toBe(size);
  });

  it('defaults to 22pt', async () => {
    const tree = await render('check');
    expect(tree.root.findByType(Svg).props.width).toBe(22);
  });
});
