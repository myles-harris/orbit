import { act } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import GroupSettingsScreen from '../GroupSettingsScreen';
import { useTheme } from '../../context/ThemeContext';
import { BottomActionBar } from '../../components/BottomActionBar';
import { CallWindowDial } from '../../components/CallWindowDial';
import { CadenceFields } from '../../components/CadenceFields';
import { FormScreen } from '../../components/FormScreen';
import { Icon } from '../../components/Icon';
import NumberPicker from '../../components/NumberPicker';
import { SegmentedControl } from '../../components/SegmentedControl';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { allText, stepperShowing } from '../../testUtils/tree';
import { dragDial, hitAreaOf, path, touchAt } from '../../testUtils/dial';
import { darkTheme, lightTheme } from '../../theme';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockParams: { groupId: string; isOwner: boolean } = { groupId: 'g1', isOwner: true };

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({ createAuthenticatedApiClient: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const LONDON = 'Europe/London';

const member = (id: string, time_zone: string) => ({ user_id: id, username: `user-${id}`, role: 'member', time_zone });

const GROUP = {
  id: 'g1',
  name: 'Track Club',
  owner_id: 'me',
  cadence: 'daily',
  daily_frequency: 1,
  weekly_frequency: null,
  call_duration_minutes: 5,
  call_window_start: 6,
  call_window_end: 22,
  time_zone: NY,
  is_muted: false,
  member_count: 3,
  members: [
    { user_id: 'me', username: 'me', role: 'owner', time_zone: NY },
    member('a', LA),
    member('b', LONDON),
  ],
};

function mockApi(group: Record<string, unknown> = GROUP) {
  const client = {
    get: jest.fn(async () => group),
    put: jest.fn(async () => ({})),
    post: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
    createInviteLink: jest.fn(),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

async function renderSettings(opts: { isOwner?: boolean; mode?: Mode; group?: Record<string, unknown> } = {}) {
  const { isOwner = true, mode = 'dark', group } = opts;
  mockParams = { groupId: 'g1', isOwner };
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  const client = mockApi(group);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GroupSettingsScreen />);
  });
  return { tree, client };
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

/** The rendered text of every host <Text>, in tree order — see testUtils. */
const has = (tree: ReactTestRenderer, text: string) => allText(tree).includes(text);
const bar = (tree: ReactTestRenderer) => tree.root.findByType(BottomActionBar).props;
const nameInput = (tree: ReactTestRenderer) => tree.root.findByType(TextInput);
const typeName = (tree: ReactTestRenderer, value: string) =>
  act(() => { nameInput(tree).props.onChangeText(value); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// ─── Save: inert until a field is dirty (AC-10, Step 18) ──────────────────────

describe('GroupSettingsScreen Save changes', () => {
  it('starts inert, captioned "Nothing to save yet."', async () => {
    const { tree } = await renderSettings();
    expect(bar(tree)).toMatchObject({ label: 'Save changes', disabled: true, caption: 'Nothing to save yet.' });
  });

  it('activates on editing the name, and clears the caption', async () => {
    const { tree } = await renderSettings();
    typeName(tree, 'Track Club 2');
    expect(bar(tree).disabled).toBe(false);
    expect(bar(tree).caption).toBeUndefined();
  });

  it('goes inert again when the edit is reverted', async () => {
    const { tree } = await renderSettings();
    typeName(tree, 'Track Club 2');
    typeName(tree, 'Track Club');
    expect(bar(tree)).toMatchObject({ disabled: true, caption: 'Nothing to save yet.' });
  });

  it('activates on any owner field — a stepper here, the dial there', async () => {
    const stepped = await renderSettings();
    act(() => { stepperShowing(stepped.tree, '5 min').props.onChange(6); });
    expect(bar(stepped.tree).disabled).toBe(false);

    const dragged = await renderSettings();
    dragDial(dragged.tree.root, path(7, 9)); // the start handle, two hours later
    expect(bar(dragged.tree).disabled).toBe(false);
  });

  it('does not activate on a tap or a brush of the dial: nothing has moved', async () => {
    const { tree } = await renderSettings();
    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    act(() => { hitAreaOf(tree.root).props.onResponderRelease(); });
    expect(bar(tree).disabled).toBe(true);
  });

  it('activates on switching cadence, and reverts when switched back', async () => {
    const { tree } = await renderSettings();
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    expect(bar(tree).disabled).toBe(false);
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('daily'); });
    expect(bar(tree).disabled).toBe(true);
  });

  it('stays inert when the already-selected cadence is tapped again', async () => {
    // A weekly group saved at 3 calls a week: re-tapping "Weekly" must not reset it to 1
    // and turn the form dirty.
    const { tree } = await renderSettings({ group: { ...GROUP, cadence: 'weekly', weekly_frequency: 3 } });
    expect(stepperShowing(tree, '3')).toBeDefined();

    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    expect(bar(tree).disabled).toBe(true);
    expect(stepperShowing(tree, '3')).toBeDefined();
  });

  it('sends only what changed', async () => {
    const { tree, client } = await renderSettings();
    typeName(tree, '  Track Club 2  ');
    await act(async () => { await bar(tree).onPress(); });

    expect(client.put).toHaveBeenCalledTimes(1);
    expect(client.put).toHaveBeenCalledWith('/groups/g1', { name: 'Track Club 2' });
  });

  it('sends the call window as a pair, never one hour alone', async () => {
    const { tree, client } = await renderSettings();
    // Only the earliest hour moves; the latest still goes with it.
    act(() => { stepperShowing(tree, '6 AM').props.onChange(7); });
    await act(async () => { await bar(tree).onPress(); });

    expect(client.put).toHaveBeenCalledWith('/groups/g1', { call_window_start: 7, call_window_end: 22 });
  });

  it('restates the frequency when the cadence flips', async () => {
    const { tree, client } = await renderSettings();
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    await act(async () => { await bar(tree).onPress(); });

    expect(client.put).toHaveBeenCalledWith('/groups/g1', { cadence: 'weekly', weekly_frequency: 1 });
  });

  it('refuses an empty name', async () => {
    const { tree, client } = await renderSettings();
    typeName(tree, '   ');
    await act(async () => { await bar(tree).onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Group name cannot be empty');
    expect(client.put).not.toHaveBeenCalled();
  });
});

// ─── The dial and the page's ScrollView ───────────────────────────────────────

const formScroll = (tree: ReactTestRenderer) => tree.root.findByType(ScrollView);

describe('GroupSettingsScreen dial drag', () => {
  it('stops the form scrolling while a handle is held, and frees it on release', async () => {
    const { tree } = await renderSettings();
    const area = () => hitAreaOf(tree.root);
    expect(formScroll(tree).props.scrollEnabled).toBe(true);

    act(() => { area().props.onResponderGrant(touchAt(8)); });
    expect(formScroll(tree).props.scrollEnabled).toBe(false);

    act(() => { area().props.onResponderRelease(); });
    expect(formScroll(tree).props.scrollEnabled).toBe(true);
  });

  it('frees the form again if React Native takes the touch away mid-drag', async () => {
    const { tree } = await renderSettings();
    act(() => { hitAreaOf(tree.root).props.onResponderGrant(touchAt(8)); });
    act(() => { hitAreaOf(tree.root).props.onResponderTerminate(); });
    expect(formScroll(tree).props.scrollEnabled).toBe(true);
  });

  it('moves the window with a drag, and the steppers follow it', async () => {
    const { tree } = await renderSettings();
    dragDial(tree.root, path(7, 9));
    // The start handle swept two hours: 6 AM -> 8 AM.
    expect(stepperShowing(tree, '8 AM')).toBeDefined();
    expect(stepperShowing(tree, '10 PM')).toBeDefined();
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('GroupSettingsScreen accessibility', () => {
  it('labels the name input, not just its placeholder', async () => {
    const { tree } = await renderSettings();
    expect(nameInput(tree).props.accessibilityLabel).toBe('Group name');
  });

  it('labels every stepper with what it sets', async () => {
    const { tree } = await renderSettings();
    expect(stepperShowing(tree, '6 AM').props.accessibilityLabel).toBe('From');
    expect(stepperShowing(tree, '10 PM').props.accessibilityLabel).toBe('Until');
    expect(stepperShowing(tree, '5 min').props.accessibilityLabel).toBe('Call duration');

    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    expect(stepperShowing(tree, '1').props.accessibilityLabel).toBe('Calls per week');
  });
});

// ─── Shared, not re-drawn ─────────────────────────────────────────────────────

describe('GroupSettingsScreen composition', () => {
  it('is built from the shared form shell and cadence fields', async () => {
    const { tree } = await renderSettings();
    expect(tree.root.findAllByType(FormScreen)).toHaveLength(1);
    expect(tree.root.findAllByType(CadenceFields)).toHaveLength(1);
    // The owner's duration ceiling ratchets: a group saved above the usual cap keeps it.
    expect(tree.root.findByType(CadenceFields).props.durationCeiling).toBe(30);
  });

  it('keeps a group already saved above the usual duration cap at its true value', async () => {
    const { tree } = await renderSettings({ group: { ...GROUP, call_duration_minutes: 45 } });
    expect(tree.root.findByType(CadenceFields).props.durationCeiling).toBe(45);
  });
});

// ─── Labels and the owner form ────────────────────────────────────────────────

describe('GroupSettingsScreen owner form', () => {
  it('labels the call window "Call window", and nothing else calls it a call window', async () => {
    const { tree } = await renderSettings();
    expect(has(tree, 'Call window')).toBe(true);
    const mentions = allText(tree).filter((t) => /call window/i.test(t));
    // The label itself. Helper prose says "within this window", not "call window".
    expect(mentions.every((t) => t === 'Call window')).toBe(true);
    expect(allText(tree).some((t) => /^(Earliest|Latest)$/i.test(t))).toBe(false);
  });

  it('draws the full designed owner form', async () => {
    const { tree } = await renderSettings();
    for (const label of [
      'Group name', 'Call frequency', 'Call duration', 'Call window', 'From', 'Until',
      'Invite link', 'Share invite link', 'Mute notifications', 'Transfer ownership',
      'Danger zone', 'Delete group',
    ]) {
      expect(has(tree, label)).toBe(true);
    }
    expect(tree.root.findAllByType(CallWindowDial)).toHaveLength(1);
  });

  it('shows the camera badge — marigold — to an owner', async () => {
    const { tree } = await renderSettings();
    const camera = tree.root.findAllByType(Icon).filter((i) => i.props.name === 'camera');
    expect(camera).toHaveLength(1);
    expect(camera[0].props.color).toBe(darkTheme.colors.onAccent);
  });

  it('leaves the camera badge out of the accessibility tree — it does nothing yet', async () => {
    const { tree } = await renderSettings();
    const badge = tree.root.findAll((n) => n.props.pointerEvents === 'none' && n.props.accessibilityElementsHidden)[0];
    expect(badge).toBeDefined();
    expect(badge.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(badge.props.onPress).toBeUndefined();
  });

  it('shows the weekly stepper only for a weekly cadence', async () => {
    const { tree } = await renderSettings();
    expect(has(tree, 'Calls per week')).toBe(false);
    act(() => { tree.root.findByType(SegmentedControl).props.onChange('weekly'); });
    expect(has(tree, 'Calls per week')).toBe(true);
  });

  it('shows three deduplicated preview lines for members across three zones', async () => {
    const { tree } = await renderSettings({
      group: { ...GROUP, members: [...GROUP.members, member('c', LA), member('d', NY)], member_count: 5 },
    });
    const lines = allText(tree).filter((t) => /^[A-Za-z]+\/[A-Za-z_]+ · /.test(t));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(`${NY} · 6 AM – 10 PM · group`);
    expect(lines.filter((l) => l.startsWith(LA))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith(LONDON))).toHaveLength(1);
  });

  it('clamps the two steppers by each other’s hour', async () => {
    const { tree } = await renderSettings();
    const from = stepperShowing(tree, '6 AM');
    const until = stepperShowing(tree, '10 PM');
    expect(from.props.max).toBe(21); // windowStartMax(22)
    expect(until.props.min).toBe(7); // windowEndMin(6)
  });

  it('gives the duration stepper the wide readout', async () => {
    const { tree } = await renderSettings();
    expect(stepperShowing(tree, '5 min').props.wide).toBe(true);
  });

  it('starts the mute toggle from the group and sends the change', async () => {
    const { tree, client } = await renderSettings({ group: { ...GROUP, is_muted: true } });
    const toggle = tree.root.findAll((n) => n.props.variant?.type === 'toggle')[0];
    expect(toggle.props.variant.value).toBe(true);
    await act(async () => { await toggle.props.variant.onToggle(false); });
    expect(client.put).toHaveBeenCalledWith('/groups/g1/mute', { muted: false });
  });

  it('sets no text in marigold on the light theme, where it is 1.60:1', async () => {
    const { tree } = await renderSettings({ mode: 'light' });
    const textColours = tree.root
      .findAll((n) => (n.type as unknown) === 'Text')
      .map((n) => StyleSheet.flatten(n.props.style)?.color);
    expect(textColours).not.toContain(lightTheme.colors.accent);
  });
});

// ─── Non-owner ────────────────────────────────────────────────────────────────

describe('GroupSettingsScreen for a member who is not the owner', () => {
  it('sees neither the owner-only section nor the danger zone', async () => {
    const { tree } = await renderSettings({ isOwner: false });

    for (const gone of ['Danger zone', 'Delete group', 'Invite link', 'Share invite link', 'Transfer ownership', 'From', 'Until']) {
      expect(has(tree, gone)).toBe(false);
    }
    expect(tree.root.findAllByType(SegmentedControl)).toHaveLength(0);
    expect(tree.root.findAllByType(CallWindowDial)).toHaveLength(0);
    expect(tree.root.findAllByType(NumberPicker)).toHaveLength(0);
    expect(tree.root.findAllByType(Icon).some((i) => i.props.name === 'camera')).toBe(false);
  });

  it('can still change the name, mute, and leave', async () => {
    const { tree, client } = await renderSettings({ isOwner: false });
    expect(has(tree, 'Mute notifications')).toBe(true);
    expect(has(tree, 'Leave group')).toBe(true);
    expect(has(tree, 'Only the group owner can change these.')).toBe(true);

    typeName(tree, 'Renamed');
    expect(bar(tree).disabled).toBe(false);
    await act(async () => { await bar(tree).onPress(); });
    // Members may rename, and only rename.
    expect(client.put).toHaveBeenCalledWith('/groups/g1', { name: 'Renamed' });
  });

  it('shows the group’s settings read-only, with the zone lines under the window', async () => {
    const { tree } = await renderSettings({ isOwner: false });
    expect(has(tree, 'Call frequency')).toBe(true);
    expect(has(tree, 'Call duration')).toBe(true);
    expect(has(tree, 'Call window')).toBe(true);
    expect(has(tree, '6 AM – 10 PM')).toBe(true);
    expect(allText(tree).filter((t) => t.includes(' · '))).toHaveLength(3);
  });

  it('leaves the group after confirming', async () => {
    const { tree, client } = await renderSettings({ isOwner: false });
    const leave = tree.root.findAll((n) => n.props.label === 'Leave group' && typeof n.props.onPress === 'function')[0];
    act(() => { leave.props.onPress(); });

    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Leave Group');
    await act(async () => { await buttons.find((b: { text: string }) => b.text === 'Leave').onPress(); });
    expect(client.post).toHaveBeenCalledWith('/groups/g1/leave', {});
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });
});

// ─── Chrome ───────────────────────────────────────────────────────────────────

describe('GroupSettingsScreen chrome', () => {
  it('draws its own title and back chevron, since the navigator header is off', async () => {
    const { tree } = await renderSettings();
    expect(has(tree, 'Group settings')).toBe(true);
    act(() => { tree.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress(); });
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('keeps a way back while loading', async () => {
    mockParams = { groupId: 'g1', isOwner: true };
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    (createAuthenticatedApiClient as jest.Mock).mockResolvedValue({ get: () => new Promise(() => {}) });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<GroupSettingsScreen />); });
    expect(tree.root.findByProps({ accessibilityLabel: 'Back' })).toBeDefined();
    expect(tree.root.findAllByType(BottomActionBar)).toHaveLength(0);
  });
});
