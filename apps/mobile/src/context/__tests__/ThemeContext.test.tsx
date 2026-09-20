import { act } from 'react';
import { Text } from 'react-native';
import renderer, { type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { darkTheme, lightTheme } from '../../theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// `react-native` reads useColorScheme lazily from this module, so mocking it
// here changes what the provider sees as the system scheme.
const mockSystemScheme = jest.fn<'light' | 'dark' | null, []>();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockSystemScheme(),
}));

const KEY = 'orbit.theme.mode';

let latest!: ReturnType<typeof useTheme>;
function Probe() {
  latest = useTheme();
  return <Text>{`mode:${latest.mode}`}</Text>;
}

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ThemeProvider><Probe /></ThemeProvider>);
  });
  return tree;
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  mockSystemScheme.mockReset();
});

// ─── T9 — a persisted mode wins over the system scheme on mount ───────────────

describe('ThemeProvider mode on mount', () => {
  it('opens Light when Light was stored, on a system-dark device', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await AsyncStorage.setItem(KEY, 'light');
    await mount();
    expect(latest.mode).toBe('light');
    expect(latest.theme).toBe(lightTheme);
  });

  it('opens Dark when Dark was stored, on a system-light device', async () => {
    mockSystemScheme.mockReturnValue('light');
    await AsyncStorage.setItem(KEY, 'dark');
    await mount();
    expect(latest.mode).toBe('dark');
    expect(latest.theme).toBe(darkTheme);
  });

  it('follows a dark system scheme when nothing is stored', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await mount();
    expect(latest.mode).toBe('dark');
  });

  it('follows a light system scheme when nothing is stored', async () => {
    mockSystemScheme.mockReturnValue('light');
    await mount();
    expect(latest.mode).toBe('light');
  });

  it('opens Dark when nothing is stored and the system reports no scheme', async () => {
    mockSystemScheme.mockReturnValue(null);
    await mount();
    expect(latest.mode).toBe('dark');
  });

  it('ignores a stored value that is not a mode', async () => {
    mockSystemScheme.mockReturnValue('light');
    await AsyncStorage.setItem(KEY, 'sepia');
    await mount();
    expect(latest.mode).toBe('light');
  });

  it('does not store the system fallback, so the device keeps deciding until the user does', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await mount();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

// ─── No flash: nothing renders until the stored choice has been read ──────────

describe('ThemeProvider before the stored choice resolves', () => {
  it('renders nothing, then the children in the stored mode', async () => {
    mockSystemScheme.mockReturnValue('dark');
    let release!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () => new Promise<string | null>((resolve) => { release = resolve; }),
    );

    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ThemeProvider><Probe /></ThemeProvider>);
    });
    // A dark frame here is exactly the flash a Light user would see on every launch.
    expect(tree.toJSON()).toBeNull();

    await act(async () => { release('light'); });
    expect(latest.mode).toBe('light');
    expect(tree.toJSON()).not.toBeNull();
  });

  it('still renders, in the system scheme, when storage cannot be read', async () => {
    mockSystemScheme.mockReturnValue('light');
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));
    await mount();
    expect(latest.mode).toBe('light');
  });
});

// ─── setMode writes the choice through ────────────────────────────────────────

describe('setMode', () => {
  it('applies the mode and stores it', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await mount();

    await act(async () => { latest.setMode('light'); });

    expect(latest.mode).toBe('light');
    expect(latest.theme).toBe(lightTheme);
    expect(await AsyncStorage.getItem(KEY)).toBe('light');
  });

  it('survives a restart: a fresh mount reads back what was chosen', async () => {
    mockSystemScheme.mockReturnValue('dark');
    const first = await mount();
    await act(async () => { latest.setMode('light'); });
    act(() => { first.unmount(); });

    await mount();
    expect(latest.mode).toBe('light');
  });

  it('keeps the choice for the session when the write fails', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await mount();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await act(async () => { latest.setMode('light'); });

    expect(latest.mode).toBe('light');
  });

  it('toggleTheme flips the mode and stores it too', async () => {
    mockSystemScheme.mockReturnValue('dark');
    await mount();

    await act(async () => { latest.toggleTheme(); });

    expect(latest.mode).toBe('light');
    expect(await AsyncStorage.getItem(KEY)).toBe('light');
  });
});
