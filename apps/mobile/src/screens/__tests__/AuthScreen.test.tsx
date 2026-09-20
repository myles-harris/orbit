import { act } from 'react';
import { Alert, Image, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import AuthScreen from '../AuthScreen';
import { useTheme } from '../../context/ThemeContext';
import { OrbitLogo } from '../../components/OrbitLogo';
import { setAccessToken } from '../../utils/apiClient';
import { allText, textOf } from '../../testUtils/tree';
import { darkTheme, lightTheme, onPhoto, scrim } from '../../theme';

const mockRequest = jest.fn();
const mockOnLogin = jest.fn();

jest.mock('@orbit/shared', () => ({
  ApiClient: class {
    request(...args: unknown[]) { return mockRequest(...args); }
  },
}));
jest.mock('../../config', () => ({ API_URL: 'http://test' }));
jest.mock('../../utils/apiClient', () => ({ setAccessToken: jest.fn(async () => {}) }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn(async () => {}) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ onLogin: mockOnLogin }) }));
jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;

function render(mode: Mode = 'dark'): ReactTestRenderer {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<AuthScreen />); });
  return tree;
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

const input = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function',
    { deep: false },
  )[0];
const typeInto = (tree: ReactTestRenderer, label: string, value: string) =>
  act(() => { input(tree, label).props.onChangeText(value); });
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && textOf(n) === label,
    { deep: false },
  )[0];
const tap = (tree: ReactTestRenderer, label: string) =>
  act(async () => { await button(tree, label).props.onPress(); });
const has = (tree: ReactTestRenderer, text: string) => allText(tree).includes(text);

/** Sends a code for a US number, so the tree is on the verify step. */
async function reachVerify(tree: ReactTestRenderer) {
  mockRequest.mockResolvedValueOnce({ status: 'sent' });
  typeInto(tree, 'Phone number', '4045550117');
  await tap(tree, 'Send code');
}

/** …and verifies with `response`. */
async function verifyWith(tree: ReactTestRenderer, response: unknown) {
  mockRequest.mockResolvedValueOnce(response);
  typeInto(tree, 'Verification code', '123456');
  await tap(tree, 'Verify');
}

const NEW_USER = { is_new_user: true, signup_token: 'signup-token' };
const EXISTING_USER = { is_new_user: false, access_token: 'access', refresh_token: 'refresh' };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequest.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// ─── The phone step, as drawn ─────────────────────────────────────────────────

describe('AuthScreen phone step', () => {
  it('opens on the phone field with the drawn copy — no Create Account / Log In fork', () => {
    const tree = render();
    expect(has(tree, 'Phone number')).toBe(true);
    expect(has(tree, 'Standard message rates apply.')).toBe(true);
    expect(has(tree, 'Send code')).toBe(true);
    expect(has(tree, 'Create Account')).toBe(false);
    expect(has(tree, 'Log In')).toBe(false);
  });

  it('draws the sky, the scrim at 0 / 30% / 72% / 100%, and the logo at the sign-in scale', () => {
    const tree = render();

    const image = tree.root.findByType(Image);
    expect(JSON.stringify(image.props.source)).toContain('signin-sky');
    expect(image.props.resizeMode).toBe('cover');

    const gradient = tree.root.findByType(LinearGradient);
    expect(gradient.props.colors).toEqual(scrim.signIn);
    expect(gradient.props.locations).toEqual([0, 0.3, 0.72, 1]);

    expect(tree.root.findByType(OrbitLogo).props.capHeight).toBe(161);
  });

  it('places the logo under the real status bar and the footer above the real home indicator', () => {
    const tree = render();
    const content = StyleSheet.flatten(tree.root.findByType(ScrollView).props.contentContainerStyle);
    expect(content.paddingTop).toBe(47 + (112 - 54));
    expect(content.paddingBottom).toBe(34);
    expect(content.paddingHorizontal).toBe(28);
  });

  it('sends the number as E.164, however it was typed or pasted', async () => {
    const tree = render();
    mockRequest.mockResolvedValueOnce({ status: 'sent' });
    typeInto(tree, 'Phone number', '(404) 555-0117');
    await tap(tree, 'Send code');

    expect(mockRequest).toHaveBeenCalledWith('POST', '/auth/request-otp', { phone: '+14045550117' });
  });

  it('keeps the country code editable, so a non-US number can still sign in', async () => {
    const tree = render();
    mockRequest.mockResolvedValueOnce({ status: 'sent' });
    typeInto(tree, 'Country code', '44');
    typeInto(tree, 'Phone number', '7911 123456');
    await tap(tree, 'Send code');

    expect(mockRequest).toHaveBeenCalledWith('POST', '/auth/request-otp', { phone: '+447911123456' });
  });

  it.each([
    ['a whole E.164 number', '+14045550117', '+14045550117'],
    ['a whole number with its formatting', '+1 (404) 555-0117', '+14045550117'],
    ['a whole international number, with the code still on +1', '+44 7911 123456', '+447911123456'],
  ])('does not add a second country code when %s is pasted into the number field', async (_label, pasted, expected) => {
    const tree = render();
    mockRequest.mockResolvedValueOnce({ status: 'sent' });
    typeInto(tree, 'Phone number', pasted);
    await tap(tree, 'Send code');

    expect(mockRequest).toHaveBeenCalledWith('POST', '/auth/request-otp', { phone: expected });
  });

  it('starts the country code at +1', () => {
    const tree = render();
    expect(input(tree, 'Country code').props.value).toBe('+1');
  });

  it('stays on the phone step and says why when the code cannot be sent', async () => {
    const tree = render();
    mockRequest.mockRejectedValueOnce(new Error('rate limited'));
    typeInto(tree, 'Phone number', '4045550117');
    await tap(tree, 'Send code');

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to send code: rate limited');
    expect(has(tree, 'Phone number')).toBe(true);
    expect(has(tree, 'Verify')).toBe(false);
  });
});

// ─── The derived steps ────────────────────────────────────────────────────────

describe('AuthScreen code step', () => {
  it('follows a sent code, on the same chrome with only the label, field and button changed', async () => {
    const tree = render();
    await reachVerify(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Code Sent', 'Check your messages for a 6-digit code.');
    expect(has(tree, 'Verification code')).toBe(true);
    expect(has(tree, 'Verify')).toBe(true);
    expect(has(tree, 'Send code')).toBe(false);
    expect(has(tree, 'Standard message rates apply.')).toBe(false);
    expect(tree.root.findByType(OrbitLogo)).toBeTruthy();
  });

  it('sends the phone and the code together', async () => {
    const tree = render();
    await reachVerify(tree);
    await verifyWith(tree, EXISTING_USER);

    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/auth/verify-otp', { phone: '+14045550117', code: '123456' });
  });

  it('signs an existing number straight in, and never shows the username step', async () => {
    const tree = render();
    await reachVerify(tree);
    await verifyWith(tree, EXISTING_USER);

    expect(setAccessToken).toHaveBeenCalledWith('access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh');
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
    expect(has(tree, 'Username')).toBe(false);
  });

  it('takes a brand-new number to the username step, without signing in yet', async () => {
    const tree = render();
    await reachVerify(tree);
    await verifyWith(tree, NEW_USER);

    expect(has(tree, 'Username')).toBe(true);
    expect(has(tree, 'Continue')).toBe(true);
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(setAccessToken).not.toHaveBeenCalled();
  });

  it('stays on the code step and says so when the code is wrong', async () => {
    const tree = render();
    await reachVerify(tree);
    mockRequest.mockRejectedValueOnce(new Error('401'));
    typeInto(tree, 'Verification code', '000000');
    await tap(tree, 'Verify');

    expect(Alert.alert).toHaveBeenLastCalledWith('Error', 'Invalid code: Error: 401');
    expect(has(tree, 'Verification code')).toBe(true);
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('goes back to the phone step with the number still there', async () => {
    const tree = render();
    await reachVerify(tree);
    act(() => { button(tree, '← Back').props.onPress(); });

    expect(has(tree, 'Send code')).toBe(true);
    expect(input(tree, 'Phone number').props.value).toBe('4045550117');
  });
});

describe('AuthScreen username step', () => {
  async function reachUsername(tree: ReactTestRenderer) {
    await reachVerify(tree);
    await verifyWith(tree, NEW_USER);
  }

  it('completes signup with the signup token and a trimmed username, then signs in', async () => {
    const tree = render();
    await reachUsername(tree);
    mockRequest.mockResolvedValueOnce({ access_token: 'new-access', refresh_token: 'new-refresh' });
    typeInto(tree, 'Username', '  sam  ');
    await tap(tree, 'Continue');

    expect(mockRequest).toHaveBeenLastCalledWith('POST', '/auth/complete-signup', {
      signup_token: 'signup-token',
      username: 'sam',
      time_zone: expect.any(String),
    });
    expect(setAccessToken).toHaveBeenCalledWith('new-access');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'new-refresh');
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank username without asking the server', async () => {
    const tree = render();
    await reachUsername(tree);
    const callsBefore = mockRequest.mock.calls.length;
    typeInto(tree, 'Username', '   ');
    await tap(tree, 'Continue');

    expect(Alert.alert).toHaveBeenLastCalledWith('Error', 'Please enter a username.');
    expect(mockRequest.mock.calls.length).toBe(callsBefore);
    expect(mockOnLogin).not.toHaveBeenCalled();
  });
});

// ─── The footer and the fixed palette ─────────────────────────────────────────

describe('AuthScreen footer and colour', () => {
  const underlined = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((n) => (n.type as unknown) === 'Text' && StyleSheet.flatten(n.props.style)?.textDecorationLine === 'underline')
      .map((n: ReactTestInstance) => textOf(n));

  it('shows the consent line, with both links underlined, on every step', async () => {
    const tree = render();
    const consentShown = () => allText(tree).some((t) => t.startsWith('By continuing you agree to the'));

    expect(consentShown()).toBe(true);
    expect(underlined(tree)).toEqual(['Terms of Service', 'Privacy Policy']);

    await reachVerify(tree);
    expect(consentShown()).toBe(true);
    expect(underlined(tree)).toEqual(['Terms of Service', 'Privacy Policy']);

    await verifyWith(tree, NEW_USER);
    expect(consentShown()).toBe(true);
    expect(underlined(tree)).toEqual(['Terms of Service', 'Privacy Policy']);
  });

  it('fills the one primary action with marigold and letters it in espresso', () => {
    const tree = render();
    const send = button(tree, 'Send code');
    expect(StyleSheet.flatten(send.props.style).backgroundColor).toBe(darkTheme.colors.accent);
    const label = send.findAll((n) => (n.type as unknown) === 'Text')[0];
    expect(StyleSheet.flatten(label.props.style).color).toBe(darkTheme.colors.onAccent);
  });

  it('draws cream and wheat from onPhoto, not from the theme', () => {
    const tree = render();
    const field = tree.root.findAll((n) => StyleSheet.flatten(n.props.style)?.height === 54)[0];
    const fieldStyle = StyleSheet.flatten(field.props.style);
    expect(fieldStyle.backgroundColor).toBe(onPhoto.field.fill);
    expect(fieldStyle.borderColor).toBe(onPhoto.field.border);
    expect(StyleSheet.flatten(input(tree, 'Phone number').props.style).color).toBe(onPhoto.title);
    expect(StyleSheet.flatten(input(tree, 'Country code').props.style).color).toBe(onPhoto.sub);
  });

  it('renders identically in light and dark', () => {
    // Functions are dropped by JSON.stringify, so this compares what is drawn.
    const light = JSON.stringify(render('light').toJSON());
    const dark = JSON.stringify(render('dark').toJSON());
    expect(light).toBe(dark);
  });
});
