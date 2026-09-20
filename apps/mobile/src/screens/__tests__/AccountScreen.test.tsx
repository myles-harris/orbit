import { act } from 'react';
import { Alert, Dimensions, Modal, ScrollView, StyleSheet, View } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import AccountScreen from '../AccountScreen';
import { useTheme } from '../../context/ThemeContext';
import { Icon } from '../../components/Icon';
import { SettingRow } from '../../components/SettingRow';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { allText, textOf } from '../../testUtils/tree';
import { darkTheme, lightTheme } from '../../theme';

const mockSetMode = jest.fn();
const mockLogout = jest.fn();
const mockShowTutorial = jest.fn();

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ onLogout: mockLogout }) }));
jest.mock('../../context/TutorialContext', () => ({ useTutorial: () => ({ showTutorial: mockShowTutorial }) }));
jest.mock('../../utils/apiClient', () => ({
  createAuthenticatedApiClient: jest.fn(),
  API_URL: 'http://test',
  peekAccessToken: () => null,
  getAccessToken: async () => null,
}));
jest.mock('../../utils/notificationChannels', () => ({ syncCallChannel: jest.fn(async () => null) }));
jest.mock('@orbit/shared', () => ({ parseApiError: () => 'Friendly error message' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({ getNotificationChannelAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => {
  const rendered = { saveAsync: jest.fn(async () => ({ uri: 'file:///resized.jpg', base64: 'BASE64' })) };
  const context = { resize: jest.fn(), renderAsync: jest.fn(async () => rendered) };
  return { ImageManipulator: { manipulate: jest.fn(() => context) }, SaveFormat: { JPEG: 'jpeg' } };
});

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

const ME = {
  id: 'me',
  username: 'myles',
  phone: '+14045550117',
  time_zone: 'America/Los_Angeles',
  has_avatar: false,
  avatar_updated_at: null,
  notify_sound: true,
  notify_vibrate: true,
  notify_break_focus: false,
};

// Where the theme trigger sits in the window, as measureInWindow would report it.
const TRIGGER = { x: 200, y: 300, width: 120, height: 40 };

function mockApi(user: Record<string, unknown> = {}) {
  const client = {
    get: jest.fn(async () => ({ ...ME, ...user })),
    patch: jest.fn(async () => ({})),
    uploadAvatar: jest.fn(async () => ({})),
    deleteAvatar: jest.fn(async () => ({})),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

async function renderAccount(opts: { mode?: Mode; user?: Record<string, unknown> } = {}) {
  const { mode = 'dark', user } = opts;
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode, setMode: mockSetMode });
  const client = mockApi(user);
  // React Native's jest setup swaps View for a mock class whose measureInWindow is a
  // bare jest.fn() that never calls back, so the menu would never get an anchor.
  // The trigger's wrapper is the only View the screen measures.
  (View as unknown as { prototype: { measureInWindow: jest.Mock } }).prototype.measureInWindow
    .mockImplementation((cb: (x: number, y: number, w: number, h: number) => void) => {
      cb(TRIGGER.x, TRIGGER.y, TRIGGER.width, TRIGGER.height);
    });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AccountScreen />);
  });
  return { tree, client };
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

/** Top-most nodes only — a TouchableOpacity is a composite over a host, both carrying its props. */
const topMost = (tree: ReactTestRenderer, test: (n: ReactTestInstance) => boolean) =>
  tree.root.findAll(test, { deep: false });

const byLabel = (tree: ReactTestRenderer, label: string) =>
  topMost(tree, (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const themeTrigger = (tree: ReactTestRenderer) =>
  topMost(tree, (n) => String(n.props.accessibilityLabel ?? '').startsWith('Theme,') && typeof n.props.onPress === 'function')[0];
const menuItems = (tree: ReactTestRenderer) =>
  topMost(tree, (n) => n.props.accessibilityRole === 'menuitem' && typeof n.props.onPress === 'function');
const row = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(SettingRow).find((r) => r.props.label === label)!;

const press = (node: ReactTestInstance) => act(() => { node.props.onPress(); });
const openMenu = (tree: ReactTestRenderer) => press(themeTrigger(tree));

const alertButtons = () => (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// ─── The screen ───────────────────────────────────────────────────────────────

describe('AccountScreen content', () => {
  it('shows the title, who you are, the three notification rows, and the version', async () => {
    const { tree } = await renderAccount();
    const text = allText(tree);
    expect(text).toEqual(expect.arrayContaining([
      'Account',
      'myles',
      '+14045550117',
      'America/Los_Angeles',
      'Notifications',
      'Chime when a call starts',
      'Vibrate when a call starts',
      'Appearance',
      'Theme',
      'Orbit 0.1.0',
      'Log out',
    ]));
  });

  it('seeds the toggles from the saved preferences', async () => {
    const { tree } = await renderAccount({ user: { notify_sound: false, notify_vibrate: true, notify_break_focus: true } });
    expect(row(tree, 'Chime when a call starts').props.variant.value).toBe(false);
    expect(row(tree, 'Vibrate when a call starts').props.variant.value).toBe(true);
    expect(row(tree, 'Let calls through Focus').props.variant.value).toBe(true);
  });

  it('keeps the way back into the tutorial', async () => {
    const { tree } = await renderAccount();
    act(() => { row(tree, 'How it works').props.onPress(); });
    expect(mockShowTutorial).toHaveBeenCalledTimes(1);
  });

  it('asks before logging out, then logs out', async () => {
    const { tree } = await renderAccount();
    press(topMost(tree, (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Log out')[0]);

    expect(Alert.alert).toHaveBeenCalledWith('Log Out', 'Are you sure you want to log out?', expect.any(Array));
    expect(mockLogout).not.toHaveBeenCalled();
    act(() => { alertButtons().find((b) => b.text === 'Log Out')!.onPress!(); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

// ─── Notification toggles still persist, and still roll back ──────────────────

describe('AccountScreen notification toggles', () => {
  it('PATCHes /me with the field and the new value', async () => {
    const { tree, client } = await renderAccount();
    await act(async () => { await row(tree, 'Vibrate when a call starts').props.variant.onToggle(false); });

    expect(client.patch).toHaveBeenCalledWith('/me', { notify_vibrate: false });
    expect(row(tree, 'Vibrate when a call starts').props.variant.value).toBe(false);
  });

  it('puts the toggle back and says so when the save fails', async () => {
    const { tree, client } = await renderAccount();
    client.patch.mockRejectedValueOnce(new Error('offline'));

    await act(async () => { await row(tree, 'Chime when a call starts').props.variant.onToggle(false); });

    expect(row(tree, 'Chime when a call starts').props.variant.value).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not save preference. Please try again.');
  });
});

// ─── The theme menu (Step 21) ─────────────────────────────────────────────────

describe('AccountScreen theme menu', () => {
  it('is closed until the trigger is pressed', async () => {
    const { tree } = await renderAccount();
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
    expect(menuItems(tree)).toHaveLength(0);
  });

  it.each(['dark', 'light'] as const)('lists Dark then Light in %s mode', async (mode) => {
    const { tree } = await renderAccount({ mode });
    openMenu(tree);
    expect(menuItems(tree).map((item) => textOf(item))).toEqual(['Dark', 'Light']);
  });

  it('marks the current mode: tinted accentSoft, selected, with a check', async () => {
    const { tree } = await renderAccount({ mode: 'light' });
    openMenu(tree);
    const [dark, light] = menuItems(tree);

    expect(light.props.accessibilityState).toEqual({ selected: true });
    expect(dark.props.accessibilityState).toEqual({ selected: false });
    expect(StyleSheet.flatten(light.props.style).backgroundColor).toBe(lightTheme.colors.accentSoft);
    expect(StyleSheet.flatten(dark.props.style).backgroundColor).toBeUndefined();
    expect(light.findAllByType(Icon).some((i) => i.props.name === 'check')).toBe(true);
    expect(dark.findAllByType(Icon).some((i) => i.props.name === 'check')).toBe(false);
  });

  it('overlays in a Modal, so nothing in the scrolling page holds the menu', async () => {
    const { tree } = await renderAccount();
    openMenu(tree);

    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    expect(tree.root.findByType(Modal).findAll((n) => n.props.accessibilityRole === 'menuitem').length).toBeGreaterThan(0);
    expect(tree.root.findByType(ScrollView).findAll((n) => n.props.accessibilityRole === 'menuitem')).toHaveLength(0);
  });

  it('sits 8pt under the trigger, right-aligned to it, 186pt wide', async () => {
    const { tree } = await renderAccount();
    openMenu(tree);

    const menu = tree.root
      .findByType(Modal)
      .findAll((n) => {
        const s = StyleSheet.flatten(n.props.style);
        return !!s && s.position === 'absolute' && s.width === 186;
      })[0];
    const style = StyleSheet.flatten(menu.props.style);
    expect(style.top).toBe(TRIGGER.y + TRIGGER.height + 8);
    expect(style.right).toBe(Dimensions.get('window').width - (TRIGGER.x + TRIGGER.width));
  });

  it('changes the theme when the other row is chosen, and closes', async () => {
    const { tree } = await renderAccount({ mode: 'dark' });
    openMenu(tree);
    press(menuItems(tree)[1]);

    expect(mockSetMode).toHaveBeenCalledTimes(1);
    expect(mockSetMode).toHaveBeenCalledWith('light');
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });

  it('closes without a write when the current row is chosen again', async () => {
    const { tree } = await renderAccount({ mode: 'dark' });
    openMenu(tree);
    press(menuItems(tree)[0]);

    expect(mockSetMode).not.toHaveBeenCalled();
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });

  it('closes without changing the theme when the backdrop is tapped', async () => {
    const { tree } = await renderAccount({ mode: 'dark' });
    openMenu(tree);
    press(byLabel(tree, 'Close theme menu'));

    expect(mockSetMode).not.toHaveBeenCalled();
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });

  it('closes without changing the theme on the Android back button', async () => {
    const { tree } = await renderAccount({ mode: 'dark' });
    openMenu(tree);
    act(() => { tree.root.findByType(Modal).props.onRequestClose(); });

    expect(mockSetMode).not.toHaveBeenCalled();
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });
});

// ─── Marigold only where AC-3 allows it on this screen ────────────────────────

describe('AccountScreen marigold', () => {
  const triggerIcon = (tree: ReactTestRenderer, name: string) =>
    themeTrigger(tree).findAllByType(Icon).find((i) => i.props.name === name)!;

  it('strokes the trigger icon marigold in dark mode — the moon', async () => {
    const { tree } = await renderAccount({ mode: 'dark' });
    expect(triggerIcon(tree, 'moon').props.color).toBe(darkTheme.colors.accent);
  });

  it('strokes the trigger icon in text colour in light mode — never marigold on cream', async () => {
    const { tree } = await renderAccount({ mode: 'light' });
    expect(triggerIcon(tree, 'sun').props.color).toBe(lightTheme.colors.text);
  });

  it.each(['dark', 'light'] as const)('borders the trigger pill in marigold in %s mode', async (mode) => {
    const { tree } = await renderAccount({ mode });
    const style = StyleSheet.flatten(themeTrigger(tree).props.style);
    expect(style.borderColor).toBe(THEMES[mode].colors.accent);
    expect(style.borderWidth).toBe(1);
  });

  it('fills the camera badge with marigold and draws the camera in the on-accent colour', async () => {
    const { tree } = await renderAccount({ mode: 'light' });
    const camera = tree.root.findAllByType(Icon).find((i) => i.props.name === 'camera')!;
    expect(camera.props.color).toBe(lightTheme.colors.onAccent);
    const badge = tree.root.findAll((n) => {
      const s = StyleSheet.flatten(n.props.style);
      return !!s && s.width === 26 && s.height === 26 && s.backgroundColor === lightTheme.colors.accent;
    });
    expect(badge.length).toBeGreaterThan(0);
  });
});

// ─── Avatar upload and delete still work ──────────────────────────────────────

describe('AccountScreen avatar', () => {
  it('goes straight to the picker when there is no photo, then uploads the re-encoded bytes', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 2000 }],
    });
    const { tree, client } = await renderAccount();

    await act(async () => { byLabel(tree, 'Change profile photo').props.onPress(); });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, base64: false }));
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///picked.jpg');
    expect(client.uploadAvatar).toHaveBeenCalledWith('BASE64', 'image/jpeg');
  });

  it('uploads nothing when the picker is cancelled', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { tree, client } = await renderAccount();

    await act(async () => { byLabel(tree, 'Change profile photo').props.onPress(); });

    expect(client.uploadAvatar).not.toHaveBeenCalled();
  });

  it('offers choose / remove / cancel when there is a photo, and removes it', async () => {
    const { tree, client } = await renderAccount({ user: { has_avatar: true, avatar_updated_at: '2026-09-01T00:00:00Z' } });

    await act(async () => { byLabel(tree, 'Change profile photo').props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith('Profile Picture', undefined, expect.any(Array));
    expect(alertButtons().map((b) => b.text)).toEqual(['Choose new photo', 'Remove photo', 'Cancel']);

    await act(async () => { alertButtons().find((b) => b.text === 'Remove photo')!.onPress!(); });
    expect(client.deleteAvatar).toHaveBeenCalledTimes(1);
  });
});
