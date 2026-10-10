import { act } from 'react';
import { Alert, Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from '@orbit/shared';
import { AuthProvider, useAuth } from '../AuthContext';
import { HOME_CACHE_KEY } from '../../utils/homeCache';
import { clearCachedCallPrefs } from '../../utils/notificationChannels';
import { setSessionExpiredHandler } from '../../utils/apiClient';
import { CallLiveActivity } from '../../../modules/call-live-activity';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('../../utils/apiClient', () => ({
  setSessionExpiredHandler: jest.fn(),
  clearAccessToken: jest.fn(),
  API_URL: 'http://test',
  createAuthenticatedApiClient: jest.fn(),
}));
jest.mock('../../utils/notificationChannels', () => ({ clearCachedCallPrefs: jest.fn(async () => {}) }));
jest.mock('@orbit/shared', () => ({ ApiClient: jest.fn() }));
jest.mock('../../../modules/call-live-activity', () => ({
  CallLiveActivity: { endAllActivitiesAsync: jest.fn(async () => {}) },
}));

let auth!: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{auth.isAuthenticated ? 'in' : 'out'}</Text>;
}

let tree: ReactTestRenderer | null = null;
async function mount() {
  await act(async () => {
    tree = renderer.create(<AuthProvider><Probe /></AuthProvider>);
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  (clearCachedCallPrefs as jest.Mock).mockClear();
  (ApiClient as unknown as jest.Mock).mockClear();
  (CallLiveActivity!.endAllActivitiesAsync as jest.Mock).mockClear();
  (setSessionExpiredHandler as jest.Mock).mockClear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

// Home's offline copy is not keyed by user, so it has to leave with the session: the
// next account to sign in on this device would otherwise see the last one's group
// names, whenever it started without a connection.
describe('logout and the saved Home copy', () => {
  const seed = () => AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ groups: [], invitations: [], fetchedAt: 1 }));

  it('clears it', async () => {
    await seed();
    await mount();

    await act(async () => { await auth.onLogout(); });

    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
    expect(clearCachedCallPrefs).toHaveBeenCalled(); // and it did so alongside the existing per-account cleanup
  });

  it('leaves it alone otherwise — signing in, or opening the app, never touches it', async () => {
    await seed();
    await mount();
    await act(async () => { auth.onLogin(); });

    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).not.toBeNull();
  });

  it('finishes before the session reads as signed out, so the next sign-in cannot beat it', async () => {
    await seed();
    await mount();
    await act(async () => { auth.onLogin(); });
    const shown = () => tree!.root.findByType(Text).props.children;
    expect(shown()).toBe('in');

    // Hold the removal open: the session must still be live while it is pending.
    let releaseRemoval!: () => void;
    (AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseRemoval = resolve; }),
    );
    let loggingOut!: Promise<void>;
    await act(async () => { loggingOut = auth.onLogout() as unknown as Promise<void>; });
    expect(shown()).toBe('in');

    releaseRemoval();
    await act(async () => { await loggingOut; });
    expect(shown()).toBe('out');
  });
});

// The server has already deleted the account by the time this runs, so it must never
// make a network call of its own — every request against the deleted account would 401.
describe('onAccountDeleted', () => {
  const seedHome = () => AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ groups: [], invitations: [], fetchedAt: 1 }));

  it('signs out without constructing an ApiClient, clearing tokens, call prefs, and the Home cache', async () => {
    await seedHome();
    await mount();

    await act(async () => { await auth.onAccountDeleted(); });

    expect(ApiClient).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('push_token');
    expect(clearCachedCallPrefs).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
  });

  it('ends every iOS Live Activity once', async () => {
    await mount();

    await act(async () => { await auth.onAccountDeleted(); });

    expect(CallLiveActivity!.endAllActivitiesAsync).toHaveBeenCalledTimes(1);
  });

  it('silences Session Expired after deletion; onLogin re-arms it', async () => {
    await mount();
    const handler = () => (setSessionExpiredHandler as jest.Mock).mock.calls[0][0] as () => void;

    await act(async () => { await auth.onAccountDeleted(); });
    act(() => { handler()(); });
    expect(Alert.alert).not.toHaveBeenCalled();

    act(() => { auth.onLogin(); });
    act(() => { handler()(); });
    expect(Alert.alert).toHaveBeenCalledWith('Session Expired', expect.any(String), expect.any(Array));
  });
});
