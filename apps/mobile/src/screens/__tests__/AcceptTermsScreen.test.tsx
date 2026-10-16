import { act } from 'react';
import { Alert, Linking } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import AcceptTermsScreen from '../AcceptTermsScreen';
import { useTheme } from '../../context/ThemeContext';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { promptDeleteAccount } from '../../utils/deleteAccount';
import { allText, textOf } from '../../testUtils/tree';
import { darkTheme } from '../../theme';
import { PRIVACY_POLICY_URL } from '../../legal';

const mockLogout = jest.fn();
const mockAccountDeleted = jest.fn();
const mockTermsAccepted = jest.fn();

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ onLogout: mockLogout, onAccountDeleted: mockAccountDeleted, onTermsAccepted: mockTermsAccepted }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../utils/apiClient', () => ({ createAuthenticatedApiClient: jest.fn() }));
jest.mock('../../utils/deleteAccount', () => ({ promptDeleteAccount: jest.fn() }));
jest.mock('../../legal', () => ({
  PRIVACY_POLICY_URL: 'https://callyourfriendsonorbit.com/privacy',
  TERMS_VERSION: 1,
}));

function mockClient(postImpl: () => Promise<unknown>) {
  const client = { post: jest.fn(postImpl) };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

async function render() {
  (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
  mockClient(async () => ({}));
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AcceptTermsScreen />);
  });
  return tree;
}

const checkbox = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')[0];
const check = (tree: ReactTestRenderer) => act(() => { checkbox(tree).props.onPress(); });
const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && textOf(n) === label)[0];
const link = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function' && textOf(n) === label)[0];
const continueButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n) === 'Continue')[0];
const tapContinue = (tree: ReactTestRenderer) => act(async () => { await continueButton(tree).props.onPress(); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('AcceptTermsScreen', () => {
  it('disables Continue until the box is ticked', async () => {
    const tree = await render();
    expect(continueButton(tree).props.disabled).toBe(true);

    await check(tree);
    expect(continueButton(tree).props.disabled).toBe(false);
  });

  it('ticked, posts to /me/accept-terms and calls onTermsAccepted', async () => {
    const tree = await render();
    const client = mockClient(async () => ({}));
    await check(tree);
    await tapContinue(tree);

    expect(client.post).toHaveBeenCalledWith('/me/accept-terms', { version: 1, age_confirmed: true });
    expect(mockTermsAccepted).toHaveBeenCalledTimes(1);
  });

  it('shows "Could not save" when the post fails', async () => {
    const tree = await render();
    mockClient(async () => { throw new Error('offline'); });
    await check(tree);
    await tapContinue(tree);

    expect(Alert.alert).toHaveBeenCalledWith('Could not save', 'Check your connection and try again.');
    expect(mockTermsAccepted).not.toHaveBeenCalled();
  });

  it('Log out calls onLogout', async () => {
    const tree = await render();
    act(() => { button(tree, 'Log out').props.onPress(); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('Delete account calls promptDeleteAccount with onAccountDeleted', async () => {
    const tree = await render();
    act(() => { button(tree, 'Delete account').props.onPress(); });
    expect(promptDeleteAccount).toHaveBeenCalledWith(mockAccountDeleted);
  });

  it('the policy link opens the URL', async () => {
    const tree = await render();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    act(() => { link(tree, 'Read the Privacy Policy').props.onPress(); });
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });

  it('shows what changed and the checkbox copy', async () => {
    const tree = await render();
    expect(allText(tree)).toEqual(expect.arrayContaining([
      "I'm 18 or older and agree to the Privacy Policy",
    ]));
  });
});
