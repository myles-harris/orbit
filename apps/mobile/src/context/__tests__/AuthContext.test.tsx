import { act } from 'react';
import { Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../AuthContext';
import { HOME_CACHE_KEY } from '../../utils/homeCache';
import { clearCachedCallPrefs } from '../../utils/notificationChannels';

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
