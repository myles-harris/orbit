import { act } from 'react';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SettingRow } from '../SettingRow';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme } from '../../theme';
import { textOf } from '../../testUtils/tree';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

function render(element: React.ReactElement): ReactTestRenderer {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(element); });
  return tree;
}

/** Top-most nodes only — a TouchableOpacity is a composite over a host, both carrying its props. */
const topMost = (tree: ReactTestRenderer, test: (n: ReactTestInstance) => boolean) =>
  tree.root.findAll(test, { deep: false });
const switches = (tree: ReactTestRenderer) =>
  topMost(tree, (n) => n.props.accessibilityRole === 'switch' && typeof n.props.onPress === 'function');
const labelText = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => (n.type as unknown) === 'Text' && textOf(n) === label)[0];

// The native Switch these rows replaced announced itself as a switch, with its state.
// The hand-rolled one has to say so too, or a screen reader user hears only "button".
describe('SettingRow toggle', () => {
  const toggle = (value: boolean, onToggle = jest.fn()) =>
    render(<SettingRow label="Chime when a call starts" variant={{ type: 'toggle', value, onToggle }} />);

  it.each([true, false])('is announced as a switch, labelled by its row, with its state (%s)', (value) => {
    const tree = toggle(value);
    const [sw, ...rest] = switches(tree);
    expect(rest).toHaveLength(0);
    expect(sw.props.accessibilityLabel).toBe('Chime when a call starts');
    expect(sw.props.accessibilityState).toEqual({ checked: value });
  });

  it.each([true, false])('flips to the opposite value when pressed (from %s)', (value) => {
    const onToggle = jest.fn();
    const tree = toggle(value, onToggle);
    act(() => { switches(tree)[0].props.onPress(); });
    expect(onToggle).toHaveBeenCalledWith(!value);
  });

  it('does not have the row label read a second time beside the switch that carries it', () => {
    const label = labelText(toggle(true), 'Chime when a call starts');
    expect(label.props.accessibilityElementsHidden).toBe(true);
    expect(label.props.importantForAccessibility).toBe('no');
  });
});

describe('SettingRow that can be pressed', () => {
  it('is announced as a button, and its label stays readable', () => {
    const tree = render(<SettingRow label="How it works" variant={{ type: 'chevron' }} onPress={jest.fn()} />);
    const [row] = topMost(tree, (n) => n.props.accessibilityRole === 'button');
    expect(row).toBeDefined();
    expect(labelText(tree, 'How it works').props.accessibilityElementsHidden).toBeFalsy();
  });

  it('is not announced as a button when it cannot be pressed', () => {
    const tree = render(<SettingRow label="Call duration" variant={{ type: 'value', value: '5 min' }} />);
    expect(topMost(tree, (n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });
});
