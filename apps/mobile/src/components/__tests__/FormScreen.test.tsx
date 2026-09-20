import { act } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import { FormScreen } from '../FormScreen';
import { BottomActionBar } from '../BottomActionBar';
import { FormHeader } from '../FormHeader';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme } from '../../theme';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

async function render(props: Partial<React.ComponentProps<typeof FormScreen>> = {}) {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  const onBack = jest.fn();
  const onPress = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <FormScreen title="New group" onBack={onBack} action={{ label: 'Create group', onPress }} {...props}>
        <Text>field</Text>
      </FormScreen>,
    );
  });
  return { tree, onBack, onPress };
}

describe('FormScreen', () => {
  it('stacks the header, the scrolling fields, then the action bar', async () => {
    const { tree } = await render();
    const order = tree.root
      .findAll((n) => [FormHeader, ScrollView, BottomActionBar].includes(n.type as never))
      .map((n) => (n.type as { name?: string }).name ?? String(n.type));

    expect(order[0]).toBe('FormHeader');
    expect(order[order.length - 1]).toBe('BottomActionBar');
    expect(tree.root.findByType(ScrollView).findByType(Text).props.children).toBe('field');
  });

  it('keeps the action bar out of the scroll, so it stays put', async () => {
    const { tree } = await render();
    expect(tree.root.findByType(ScrollView).findAllByType(BottomActionBar)).toHaveLength(0);
    expect(tree.root.findByType(ScrollView).findAllByType(FormHeader)).toHaveLength(0);
  });

  it('avoids the keyboard, and keeps taps working with it up', async () => {
    const { tree } = await render();
    expect(tree.root.findByType(KeyboardAvoidingView).props.behavior).toBe('padding'); // iOS
    expect(tree.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('titles the header and wires Back', async () => {
    const { tree, onBack } = await render({ title: 'Group settings' });
    expect(tree.root.findByType(FormHeader).props.title).toBe('Group settings');
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress(); });
    expect(onBack).toHaveBeenCalled();
  });

  it('hands the action straight to the bar, including its inert state and caption', async () => {
    const { tree, onPress } = await render({
      action: { label: 'Save changes', onPress: jest.fn(), disabled: true, caption: 'Nothing to save yet.' },
    });
    expect(tree.root.findByType(BottomActionBar).props).toMatchObject({
      label: 'Save changes',
      disabled: true,
      caption: 'Nothing to save yet.',
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('scrolls by default, and stops when told a gesture inside needs the touch', async () => {
    expect((await render()).tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);
    expect((await render({ scrollEnabled: false })).tree.root.findByType(ScrollView).props.scrollEnabled).toBe(false);
  });
});
