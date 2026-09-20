import { act } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import CreateGroupScreen from '../CreateGroupScreen';
import GroupSettingsScreen from '../GroupSettingsScreen';
import { useTheme } from '../../context/ThemeContext';
import { BottomActionBar } from '../../components/BottomActionBar';
import { CadenceFields } from '../../components/CadenceFields';
import { CallWindowDial } from '../../components/CallWindowDial';
import { CallWindowField } from '../../components/CallWindowField';
import { FormHeader } from '../../components/FormHeader';
import { FormScreen } from '../../components/FormScreen';
import NumberPicker from '../../components/NumberPicker';
import { SegmentedControl } from '../../components/SegmentedControl';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { allText, stepperShowing } from '../../testUtils/tree';
import { dragDial, hitAreaOf, path, touchAt } from '../../testUtils/dial';
import { darkTheme, lightTheme } from '../../theme';

const mockGoBack = jest.fn();

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({ createAuthenticatedApiClient: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { groupId: 'g1', isOwner: true } }),
}));
jest.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'America/Chicago' }] }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

function mockApi() {
  const client = {
    post: jest.fn(async () => ({ id: 'new-group' })),
    get: jest.fn(async () => ({
      id: 'g1', name: 'Track Club', owner_id: 'me', cadence: 'daily', weekly_frequency: null,
      call_duration_minutes: 5, call_window_start: 6, call_window_end: 22, time_zone: 'America/Chicago',
      members: [{ user_id: 'me', username: 'me', role: 'owner', time_zone: 'America/Chicago' }],
    })),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

async function renderCreate(mode: Mode = 'dark') {
  const client = mockApi();
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(<CreateGroupScreen />); });
  return { tree, client };
}

const bar = (tree: ReactTestRenderer) => tree.root.findByType(BottomActionBar).props;
const typeName = (tree: ReactTestRenderer, value: string) =>
  act(() => { tree.root.findByType(TextInput).props.onChangeText(value); });
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('CreateGroupScreen layout', () => {
  it('runs name → cadence → duration → call window, with the create action in the bottom bar', async () => {
    const { tree } = await renderCreate();
    const text = allText(tree);
    const order = ['New group', 'Group name', 'Call frequency', 'Call duration', 'Call window'].map((l) => text.indexOf(l));

    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(bar(tree)).toMatchObject({ label: 'Create group' });
    expect(bar(tree).disabled).toBeFalsy();
  });

  it('puts "Calls per week" between cadence and duration once weekly is chosen', async () => {
    const { tree } = await renderCreate();
    expect(allText(tree)).not.toContain('Calls per week');
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });

    const text = allText(tree);
    expect(text.indexOf('Calls per week')).toBeGreaterThan(text.indexOf('Call frequency'));
    expect(text.indexOf('Calls per week')).toBeLessThan(text.indexOf('Call duration'));
  });

  it('draws its own title and back chevron', async () => {
    const { tree } = await renderCreate();
    expect(tree.root.findByType(FormHeader).props.title).toBe('New group');
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress(); });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('previews the window in the device’s zone, which becomes the group’s', async () => {
    const { tree } = await renderCreate();
    expect(allText(tree)).toContain('America/Chicago · 6 AM – 10 PM · group');
  });

  it.each<Mode>(['light', 'dark'])('sets no text in marigold in %s mode', async (mode) => {
    const { tree } = await renderCreate(mode);
    const json = JSON.stringify(tree.toJSON());
    // Marigold is allowed as a fill (the button, the dial's arc) — not as a text colour.
    const textColours = tree.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .map((n) => JSON.stringify(n.props.style));
    expect(textColours.join('')).not.toContain(THEMES[mode].colors.accent);
    expect(json).toContain(THEMES[mode].colors.accent); // and it does appear as a fill
  });
});

describe('CreateGroupScreen dial drag', () => {
  it('stops the form scrolling while a handle is held, and frees it on release', async () => {
    const { tree } = await renderCreate();
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);

    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(false);

    act(() => { hitAreaOf(tree.root).props.onResponderRelease(); });
    expect(tree.root.findByType(ScrollView).props.scrollEnabled).toBe(true);
  });

  it('carries a dragged window into what it posts', async () => {
    const { tree, client } = await renderCreate();
    typeName(tree, 'Dawn Patrol');
    dragDial(tree.root, path(7, 9)); // the start handle, two hours later: 6 AM -> 8 AM
    await act(async () => { await bar(tree).onPress(); });

    expect(client.post).toHaveBeenCalledWith('/groups', expect.objectContaining({
      call_window_start: 8,
      call_window_end: 22,
    }));
  });
});

describe('CreateGroupScreen accessibility', () => {
  it('labels the name input and every stepper', async () => {
    const { tree } = await renderCreate();
    expect(tree.root.findByType(TextInput).props.accessibilityLabel).toBe('Group name');
    expect(stepperShowing(tree, '6 AM').props.accessibilityLabel).toBe('From');
    expect(stepperShowing(tree, '10 PM').props.accessibilityLabel).toBe('Until');
    expect(stepperShowing(tree, '5 min').props.accessibilityLabel).toBe('Call duration');
  });
});

describe('CreateGroupScreen create', () => {
  it('posts the name, cadence, duration, window and device zone', async () => {
    const { tree, client } = await renderCreate();
    typeName(tree, '  Saturday Crew  ');
    act(() => { stepperShowing(tree, '5 min').props.onChange(10); });
    act(() => { stepperShowing(tree, '6 AM').props.onChange(8); });
    await act(async () => { await bar(tree).onPress(); });

    expect(client.post).toHaveBeenCalledWith('/groups', {
      name: 'Saturday Crew',
      cadence: 'daily',
      daily_frequency: 1,
      call_duration_minutes: 10,
      call_window_start: 8,
      call_window_end: 22,
      time_zone: 'America/Chicago',
    });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('posts weekly_frequency for a weekly group', async () => {
    const { tree, client } = await renderCreate();
    typeName(tree, 'Weekend');
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    act(() => { stepperShowing(tree, '1').props.onChange(3); });
    await act(async () => { await bar(tree).onPress(); });

    const [, body] = client.post.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(body).toMatchObject({ cadence: 'weekly', weekly_frequency: 3 });
    expect(body).not.toHaveProperty('daily_frequency');
  });

  it('will not create a group with no name', async () => {
    const { tree, client } = await renderCreate();
    await act(async () => { await bar(tree).onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Missing Name', 'Please enter a group name');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('keeps the dial and the steppers in step: the window can never invert', async () => {
    const { tree } = await renderCreate();
    // Latest at 10 PM caps the earliest at 9 PM; earliest at 6 AM floors the latest at 7 AM.
    expect(stepperShowing(tree, '6 AM').props.max).toBe(21);
    expect(stepperShowing(tree, '10 PM').props.min).toBe(7);
  });
});

// The brief's Definition of Done: Create Group and Group Settings share one
// implementation of every control. The strongest proof a test can give is that both
// screens render the very same component types, not look-alikes.
describe('Create Group and Group Settings share their controls', () => {
  async function renderSettings() {
    mockApi();
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<GroupSettingsScreen />); });
    return tree;
  }

  it.each([
    ['form shell', FormScreen],
    ['cadence fields', CadenceFields],
    ['header', FormHeader],
    ['segmented cadence control', SegmentedControl],
    ['call-window block', CallWindowField],
    ['call-window dial', CallWindowDial],
    ['bottom action bar', BottomActionBar],
  ] as const)('both draw the %s from one component', async (_name, Component) => {
    const create = (await renderCreate()).tree;
    const settings = await renderSettings();

    expect(create.root.findAllByType(Component as never)).toHaveLength(1);
    expect(settings.root.findAllByType(Component as never)).toHaveLength(1);
  });

  it('both draw their steppers from NumberPicker, with the same window guards', async () => {
    const create = (await renderCreate()).tree;
    const settings = await renderSettings();

    // Duration, From, Until in each.
    expect(create.root.findAllByType(NumberPicker)).toHaveLength(3);
    expect(settings.root.findAllByType(NumberPicker)).toHaveLength(3);
    for (const tree of [create, settings]) {
      expect(stepperShowing(tree, '6 AM').props.max).toBe(21);
      expect(stepperShowing(tree, '10 PM').props.min).toBe(7);
    }
  });
});
