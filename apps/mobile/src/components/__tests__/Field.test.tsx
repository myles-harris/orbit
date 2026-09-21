import { act } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { Field, TextField } from '../Field';
import { useTheme } from '../../context/ThemeContext';
import { allText } from '../../testUtils/tree';
import { darkTheme, lightTheme, radius } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

async function mount(element: React.ReactElement, mode: Mode = 'dark'): Promise<ReactTestRenderer> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

describe('Field', () => {
  it('stacks the label, the control, then the helper', async () => {
    const tree = await mount(
      <Field label="Invite link" helper="Links expire in 7 days.">
        <Text>control</Text>
      </Field>,
    );
    expect(allText(tree)).toEqual(['Invite link', 'control', 'Links expire in 7 days.']);
  });

  it('draws no helper when it has none', async () => {
    const tree = await mount(<Field label="Call frequency"><Text>control</Text></Field>);
    expect(allText(tree)).toEqual(['Call frequency', 'control']);
  });

  it.each<Mode>(['light', 'dark'])('sets label and helper in textSecondary (%s)', async (mode) => {
    const tree = await mount(<Field label="A" helper="B"><Text>c</Text></Field>, mode);
    const colours = tree.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .filter((n) => ['A', 'B'].includes(String(n.props.children)))
      .map((n) => StyleSheet.flatten(n.props.style).color);
    expect(colours).toEqual([THEMES[mode].colors.textSecondary, THEMES[mode].colors.textSecondary]);
  });
});

describe('TextField', () => {
  const input = (tree: ReactTestRenderer) => tree.root.findByType(TextInput);

  it('passes the value, the change handler and the placeholder through', async () => {
    const onChangeText = jest.fn();
    const tree = await mount(<TextField label="Group name" value="Track Club" onChangeText={onChangeText} placeholder="Enter group name" />);

    expect(input(tree).props.value).toBe('Track Club');
    expect(input(tree).props.placeholder).toBe('Enter group name');
    act(() => { input(tree).props.onChangeText('Track Club 2'); });
    expect(onChangeText).toHaveBeenCalledWith('Track Club 2');
  });

  // The visible label is a sibling Text, so without this a screen reader announces the
  // field by its placeholder, or by nothing at all once it holds a value.
  it('labels the input for a screen reader with its visible label', async () => {
    const tree = await mount(<TextField label="Group name" value="x" onChangeText={() => {}} />);
    expect(input(tree).props.accessibilityLabel).toBe('Group name');
  });

  it.each<Mode>(['light', 'dark'])('is a 52pt surface field with a hairline and shadow.card (%s)', async (mode) => {
    const { colors, shadow } = THEMES[mode];
    const tree = await mount(<TextField label="Group name" value="" onChangeText={() => {}} />, mode);

    expect(StyleSheet.flatten(input(tree).props.style)).toMatchObject({
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
      color: colors.text,
      ...shadow.card,
    });
  });

  it.each<Mode>(['light', 'dark'])('sets its placeholder in textSecondary, which clears AA on the surface (%s)', async (mode) => {
    const tree = await mount(<TextField label="Group name" value="" onChangeText={() => {}} />, mode);
    expect(input(tree).props.placeholderTextColor).toBe(THEMES[mode].colors.textSecondary);
  });

  it('shows its helper under the input', async () => {
    const tree = await mount(<TextField label="Group name" helper="All members can update the group name" value="" onChangeText={() => {}} />);
    expect(allText(tree)).toEqual(['Group name', 'All members can update the group name']);
  });
});
