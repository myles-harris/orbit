import { act } from 'react';
import { Alert, RefreshControl, StyleSheet, TextInput } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroupDTO } from '@orbit/shared';
import HomeScreen from '../HomeScreen';
import { useTheme } from '../../context/ThemeContext';
import { GroupTile } from '../../components/GroupTile';
import { Icon } from '../../components/Icon';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { fetchLiveCalls, type LiveCall } from '../../utils/liveCalls';
import { HOME_CACHE_KEY, clearHomeCache, type HomeSnapshot } from '../../utils/homeCache';
import { darkTheme, lightTheme, radius } from '../../theme';

const mockNavigate = jest.fn();
// The screen's own listeners, so a test can fire 'focus' the way React Navigation does.
const mockListeners: Record<string, () => void> = {};
// One object for every render, as the real hook returns: HomeScreen's load effect
// depends on `navigation`, so a fresh object per render would reload forever.
const mockNavigation = {
  navigate: mockNavigate,
  addListener: jest.fn((event: string, callback: () => void) => {
    mockListeners[event] = callback;
    return jest.fn();
  }),
};
let mockIsFocused = true;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  createAuthenticatedApiClient: jest.fn(),
  API_URL: 'http://test',
  peekAccessToken: () => null,
  getAccessToken: async () => null,
}));
jest.mock('../../utils/liveCalls', () => ({
  ...jest.requireActual('../../utils/liveCalls'),
  fetchLiveCalls: jest.fn(),
}));
jest.mock('@orbit/shared', () => ({ parseApiError: () => 'Friendly error message' }));
// The overlay's own drawing is tested with the real component in CallSpotlight.test.tsx.
// Here it is a marker that records the props Home gave it, so these tests stay about
// Home's decisions (when it goes up, and what Dismiss and Join do) and the grid tests
// are not doubled up by a second copy of the title and a second 1s clock.
let mockSpotlightProps: {
  call: LiveCall;
  group: GroupDTO;
  active: boolean;
  onJoin: () => void;
  onDismiss: () => void;
} | null = null;
jest.mock('../../components/CallSpotlight', () => ({
  CallSpotlight: (props: NonNullable<typeof mockSpotlightProps>) => {
    mockSpotlightProps = props;
    return require('react').createElement('View', { testID: 'call-spotlight' });
  },
}));
jest.mock('../../components/GroupTile', () => {
  const actual = jest.requireActual('../../components/GroupTile');
  // A pass-through spy. Tiles re-render whenever the screen does, so counting their
  // renders counts the screen's.
  return { ...actual, GroupTile: jest.fn(actual.GroupTile) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useIsFocused: () => mockIsFocused,
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;
const MARIGOLD = darkTheme.colors.accent;
const T0 = Date.parse('2026-09-19T12:00:00.000Z');

const ME = { id: 'me', username: 'sam', has_avatar: false, avatar_updated_at: null };

const group = (over: Partial<GroupDTO> & { id: string; name: string }): GroupDTO => ({
  owner_id: 'me',
  cadence: 'daily',
  weekly_frequency: null,
  call_duration_minutes: 10,
  // The server's own defaults — GroupDTO declares the call window as always present.
  call_window_start: 6,
  call_window_end: 22,
  time_zone: 'UTC',
  has_photo: false,
  photo_updated_at: null,
  member_count: 4,
  members: [],
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

const invitation = (id: string, name: string) => ({
  id,
  invited_by: 'jo',
  group: { id: `g-${id}`, name, cadence: 'daily', weekly_frequency: null, call_duration_minutes: 10, member_count: 3 },
});

interface Fixture {
  groups?: GroupDTO[];
  invitations?: ReturnType<typeof invitation>[];
  liveCalls?: LiveCall[];
  failLoad?: boolean;
  /** Only the live-calls request fails; the groups, invitations and profile load. */
  failLiveCalls?: boolean;
}

function mockApi({ groups = [], invitations = [], liveCalls = [], failLoad = false, failLiveCalls = false }: Fixture) {
  const client = {
    get: jest.fn(async (path: string) => {
      if (failLoad) throw new Error('offline');
      if (path === '/groups') return { groups };
      if (path === '/me') return ME;
      throw new Error(`unexpected GET ${path}`);
    }),
    getMyInvitations: jest.fn(async () => {
      if (failLoad) throw new Error('offline');
      return { invitations };
    }),
    respondToInvitation: jest.fn(async (_id: string, _action: string) => ({ success: true, action: 'ok' })),
    post: jest.fn(),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  (fetchLiveCalls as jest.Mock).mockImplementation(() =>
    failLiveCalls ? Promise.reject(new Error('offline')) : Promise.resolve(liveCalls));
  return client;
}

let mounted: ReactTestRenderer[] = [];

// Under fake timers a real setTimeout(0) would never fire, so let the fake clock
// drain the microtask queue instead.
const fakeTimersOn = () => typeof (globalThis.setTimeout as unknown as { clock?: unknown }).clock === 'object';

async function flush() {
  await act(async () => {
    if (fakeTimersOn()) await jest.advanceTimersByTimeAsync(0);
    else await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderHome(fixture: Fixture, mode: Mode = 'dark') {
  const client = mockApi(fixture);
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<HomeScreen />);
  });
  await flush();
  mounted.push(tree);
  return { tree, client };
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

const flat = (style: unknown): Record<string, any> => (StyleSheet.flatten(style as never) ?? {}) as Record<string, any>;

// `type` is typed as a component type; host nodes are named by string.
const isHost = (n: ReactTestInstance, name: 'Text' | 'View') => (n.type as unknown) === name;

/**
 * The rendered text of every <Text>. Read from the output rather than the props: a
 * countdown is a component that renders its string, so a host node's `children`
 * prop is that component, not the text it draws.
 */
function allText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const content = (node: ReactTestRendererJSON | string): string =>
    typeof node === 'string' ? node : (node.children ?? []).map(content).join('');
  const visit = (node: ReactTestRendererJSON | string | null) => {
    if (node === null || typeof node === 'string') return;
    if (node.type === 'Text') out.push(content(node));
    else (node.children ?? []).forEach(visit);
  };
  const json = tree.toJSON();
  (Array.isArray(json) ? json : [json]).forEach(visit);
  return out;
}

const hasText = (tree: ReactTestRenderer, text: string) => allText(tree).includes(text);

/** The nearest ancestor of the host <Text> `text` that handles a press. */
function pressable(tree: ReactTestRenderer, text: string, index = 0): ReactTestInstance {
  const node = tree.root.findAll((n) => isHost(n, 'Text') && [n.props.children].flat().join('') === text)[index];
  if (!node) throw new Error(`no text "${text}" — have: ${allText(tree).join(' | ')}`);
  let at: ReactTestInstance | null = node;
  while (at && !at.props.onPress) at = at.parent;
  if (!at) throw new Error(`"${text}" is not inside anything pressable`);
  return at;
}

async function press(tree: ReactTestRenderer, text: string, index = 0) {
  const target = pressable(tree, text, index);
  await act(async () => {
    target.props.onPress();
  });
  await flush();
}

/** Every host node whose resolved style carries marigold or its wash. */
function marigoldNodes(tree: ReactTestRenderer, mode: Mode) {
  const { colors } = THEMES[mode];
  const ours = new Set([colors.accent, colors.accentSoft]);
  return tree.root.findAll(
    (n) => typeof n.type === 'string' && Object.values(flat(n.props.style)).some((v) => ours.has(v as string)),
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSpotlightProps = null;
});

afterEach(() => {
  mounted.forEach((t) => act(() => t.unmount()));
  mounted = [];
  jest.restoreAllMocks();
  mockNavigate.mockClear();
  mockIsFocused = true;
  Object.keys(mockListeners).forEach((k) => delete mockListeners[k]);
});

/** How many times /groups has been requested — one per load. */
const groupLoads = (client: ReturnType<typeof mockApi>) =>
  client.get.mock.calls.filter(([path]) => path === '/groups').length;

// ─── Step 13 — grid and tiles ─────────────────────────────────────────────────

describe('Home grid', () => {
  it('renders a tile per group, two to a row, with an odd last tile in its own half', async () => {
    const { tree } = await renderHome({
      groups: [
        group({ id: 'a', name: 'Alpha' }),
        group({ id: 'b', name: 'Bravo' }),
        group({ id: 'c', name: 'Charlie' }),
      ],
    });

    ['Alpha', 'Bravo', 'Charlie'].forEach((name) => expect(hasText(tree, name)).toBe(true));

    // Rows are found by their shape: a row of flex:1 children with the grid gap.
    const rows = tree.root.findAll((n) => isHost(n, 'View') && flat(n.props.style).flexDirection === 'row' && flat(n.props.style).gap === 10);
    expect(rows).toHaveLength(2);
    expect(rows[0].children).toHaveLength(2);
    expect(rows[1].children).toHaveLength(2); // Charlie + a spacer, so it stays a half-width square
  });

  it('shows "muted" as the sub-label of a muted group only', async () => {
    const { tree } = await renderHome({
      groups: [group({ id: 'a', name: 'Alpha', is_muted: true }), group({ id: 'b', name: 'Bravo' })],
    });
    expect(allText(tree).filter((t) => t === 'muted')).toHaveLength(1);
  });

  it('labels tiles with their cadence', async () => {
    const { tree } = await renderHome({
      groups: [
        group({ id: 'a', name: 'Alpha', cadence: 'daily' }),
        group({ id: 'b', name: 'Bravo', cadence: 'weekly', weekly_frequency: 3 }),
        group({ id: 'c', name: 'Charlie', cadence: 'weekly', weekly_frequency: null }),
      ],
    });
    // "Daily" and "Weekly" are also tab labels, so a tile's cadence shows up as the
    // second occurrence; "3×/wk" only ever appears on a tile.
    const count = (text: string) => allText(tree).filter((t) => t === text).length;
    expect(count('Daily')).toBe(2); // tab + Alpha
    expect(count('Weekly')).toBe(2); // tab + Charlie
    expect(count('3×/wk')).toBe(1); // Bravo
  });

  it('opens a group from its tile', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    await press(tree, 'Alpha');
    expect(mockNavigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'a' });
  });

  it('has one bottom action, the bar — no floating button', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    expect(hasText(tree, '+')).toBe(false);
    await press(tree, 'New group');
    expect(mockNavigate).toHaveBeenCalledWith('CreateGroup');
  });
});

// ─── Step 14 — header, filters, bottom bar ────────────────────────────────────

describe('Home header, filters and bottom bar', () => {
  it('has the wordmark and an avatar button that opens Account', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    expect(hasText(tree, 'Orbit')).toBe(true);

    const avatar = tree.root.find((n) => n.props.accessibilityLabel === 'Account' && !!n.props.onPress);
    await act(async () => avatar.props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('Account');
  });

  it('keeps the avatar button — and Account — reachable when /me fails', async () => {
    const client = mockApi({ groups: [group({ id: 'a', name: 'Alpha' })] });
    client.get.mockImplementation(async (path: string) => {
      if (path === '/groups') return { groups: [group({ id: 'a', name: 'Alpha' })] };
      throw new Error('me is down');
    });
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<HomeScreen />); });
    await flush();
    mounted.push(tree);

    expect(hasText(tree, 'Alpha')).toBe(true);
    // deep:false — RN's TouchableOpacity is a forwardRef around a class, and both
    // carry the props; this is one button.
    const buttons = tree.root.findAll((n) => n.props.accessibilityLabel === 'Account' && !!n.props.onPress, { deep: false });
    expect(buttons).toHaveLength(1);
    await act(async () => buttons[0].props.onPress());
    expect(mockNavigate).toHaveBeenCalledWith('Account');
  });

  it('filters the list: Daily and Weekly show only their own groups', async () => {
    const { tree } = await renderHome({
      groups: [
        group({ id: 'a', name: 'Alpha', cadence: 'daily' }),
        group({ id: 'b', name: 'Bravo', cadence: 'weekly', weekly_frequency: 2 }),
      ],
    });
    expect(hasText(tree, 'Alpha') && hasText(tree, 'Bravo')).toBe(true);

    await press(tree, 'Weekly');
    expect(hasText(tree, 'Bravo')).toBe(true);
    expect(hasText(tree, 'Alpha')).toBe(false);

    await press(tree, 'Daily');
    expect(hasText(tree, 'Alpha')).toBe(true);
    expect(hasText(tree, 'Bravo')).toBe(false);

    await press(tree, 'All');
    expect(hasText(tree, 'Alpha') && hasText(tree, 'Bravo')).toBe(true);
  });

  it('says so when a filter matches nothing', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha', cadence: 'daily' })] });
    await press(tree, 'Weekly');
    expect(hasText(tree, 'No weekly groups')).toBe(true);
  });

  it('shows the Invited count badge only while an invitation is pending', async () => {
    const none = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    expect(hasText(none.tree, 'Invited')).toBe(true);
    expect(hasText(none.tree, '0')).toBe(false);

    const two = await renderHome({
      groups: [group({ id: 'a', name: 'Alpha' })],
      invitations: [invitation('i1', 'Book Club'), invitation('i2', 'Run Club')],
    });
    expect(hasText(two.tree, '2')).toBe(true);
  });

  it('"New group" is the outlined secondary button, not marigold', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    const bar = flat(pressable(tree, 'New group').props.style);
    expect(bar.backgroundColor).toBe('transparent');
    expect(bar.borderColor).toBe(darkTheme.colors.borderStrong);
  });

  // The Definition of Done: with nothing live, the only marigold on screen is the
  // active tab's underline.
  it.each<Mode>(['light', 'dark'])(
    'has exactly one marigold element with nothing live — the active tab underline (%s)',
    async (mode) => {
      const { tree } = await renderHome(
        { groups: [group({ id: 'a', name: 'Alpha' }), group({ id: 'b', name: 'Bravo', is_muted: true })] },
        mode,
      );
      const marigold = marigoldNodes(tree, mode);
      expect(marigold).toHaveLength(1);
      expect(flat(marigold[0].props.style)).toMatchObject({ height: 2, backgroundColor: MARIGOLD });
    },
  );

  it('moves the underline with the active filter', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    const underlineUnder = (tab: string) => {
      const touchable = pressable(tree, tab);
      const rule = touchable.findAll((n) => isHost(n, 'View') && flat(n.props.style).height === 2)[0];
      return flat(rule.props.style).backgroundColor;
    };
    expect(underlineUnder('All')).toBe(MARIGOLD);
    expect(underlineUnder('Daily')).toBe('transparent');

    await press(tree, 'Daily');
    expect(underlineUnder('All')).toBe('transparent');
    expect(underlineUnder('Daily')).toBe(MARIGOLD);
  });
});

// ─── Invitations ──────────────────────────────────────────────────────────────

describe('Home invitations', () => {
  const fixture = {
    groups: [group({ id: 'a', name: 'Alpha' })],
    invitations: [invitation('i1', 'Book Club'), invitation('i2', 'Run Club')],
  };

  it('lists one row per pending invitation under Invited, with inline Decline, Later and Accept', async () => {
    const { tree } = await renderHome(fixture);
    await press(tree, 'Invited');

    expect(hasText(tree, 'Book Club') && hasText(tree, 'Run Club')).toBe(true);
    expect(hasText(tree, 'Alpha')).toBe(false); // the grid swapped to invitations
    expect(allText(tree).filter((t) => t === 'Accept')).toHaveLength(2);
    expect(allText(tree).filter((t) => t === 'Later')).toHaveLength(2);
    expect(allText(tree).filter((t) => t === 'Decline')).toHaveLength(2);
    expect(allText(tree).some((t) => t.startsWith('Invited by jo'))).toBe(true);
  });

  it('Accept responds to that invitation and reloads', async () => {
    const { tree, client } = await renderHome(fixture);
    await press(tree, 'Invited');
    const before = client.get.mock.calls.length;

    await press(tree, 'Accept');

    expect(client.respondToInvitation).toHaveBeenCalledWith('i1', 'accept');
    expect(client.get.mock.calls.length).toBeGreaterThan(before); // loadData ran again
  });

  it('Later hides the row and the badge count for the session, and tells the server', async () => {
    const { tree, client } = await renderHome(fixture);
    await press(tree, 'Invited');

    await press(tree, 'Later');

    expect(client.respondToInvitation).toHaveBeenCalledWith('i1', 'dismiss');
    expect(hasText(tree, 'Book Club')).toBe(false);
    expect(hasText(tree, 'Run Club')).toBe(true);
    expect(hasText(tree, '1')).toBe(true); // badge fell from 2 to 1
  });

  it('follows the group back to All when the last invitation is accepted', async () => {
    const { tree } = await renderHome({ ...fixture, invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Invited');
    await press(tree, 'Accept');
    expect(hasText(tree, 'Alpha')).toBe(true);
  });

  it('says so when there is nothing pending', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    await press(tree, 'Invited');
    expect(hasText(tree, 'No pending invitations')).toBe(true);
  });

  it.each<Mode>(['light', 'dark'])('Accept is the row\'s marigold fill, and the row is bordered in marigold (%s)', async (mode) => {
    const { tree } = await renderHome(fixture, mode);
    await press(tree, 'Invited');
    const accept = pressable(tree, 'Accept');
    expect(flat(accept.props.style).backgroundColor).toBe(MARIGOLD);

    let row: ReactTestInstance | null = accept.parent;
    while (row && !(isHost(row, 'View') && flat(row.props.style).borderColor)) row = row.parent;
    expect(row && flat(row.props.style)).toMatchObject({
      borderWidth: 1,
      borderColor: MARIGOLD,
      backgroundColor: THEMES[mode].colors.accentSoft,
    });
  });
});

// ─── Step 15 — live card and empty state ──────────────────────────────────────

describe('Home live call', () => {
  const groups = [
    group({ id: 'a', name: 'Alpha', member_count: 4 }),
    group({ id: 'b', name: 'Bravo' }),
    group({ id: 'c', name: 'Charlie' }),
  ];
  const iso = (ms: number) => new Date(ms).toISOString();
  // Scheduled, ends 12:04 from T0. Started a minute ago — the more recent, so the hero.
  const callA: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: iso(T0 - 60_000),
    ends_at: iso(T0 + 724_000), participant_count: 2,
  };
  // Scheduled, started five minutes ago.
  const callB: LiveCall = {
    id: 'cb', group_id: 'b', call_type: 'scheduled', started_at: iso(T0 - 300_000),
    ends_at: iso(T0 + 544_000), participant_count: 1,
  };
  const looksLikeCountdown = (t: string) => /^\d+:\d{2}(:\d{2})?$/.test(t);
  const oneSecondClocks = (spy: jest.SpyInstance) => spy.mock.calls.filter(([, ms]) => ms === 1000);
  const longTimeouts = (spy: jest.SpyInstance) => spy.mock.calls.map(([, ms]) => ms as number).filter((ms) => ms >= 1000);

  // The wall clock the screen reads, moved by hand.
  let elapsed = 0;
  const advanceClock = (ms: number) => { elapsed += ms; };
  beforeEach(() => {
    elapsed = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => T0 + elapsed);
  });

  it('renders the live card at the top with the joined count and a countdown', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });

    expect(hasText(tree, '2 of 4 joined')).toBe(true);
    expect(hasText(tree, '12:04')).toBe(true);
    expect(hasText(tree, 'Join')).toBe(true);
  });

  it('does not also draw the hero group as a tile', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    expect(allText(tree).filter((t) => t === 'Alpha')).toHaveLength(1); // the card only
    expect(hasText(tree, 'Bravo') && hasText(tree, 'Charlie')).toBe(true);
  });

  it('gives a second concurrent live group its tile, a marigold border and a "live" label', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA, callB] });

    expect(allText(tree).filter((t) => t === 'Alpha')).toHaveLength(1);
    expect(allText(tree).filter((t) => t === 'Bravo')).toHaveLength(1);
    expect(allText(tree).filter((t) => t === 'live')).toHaveLength(1);

    const bravoTile = pressable(tree, 'Bravo');
    expect(flat(bravoTile.props.style)).toMatchObject({ borderWidth: 1, borderColor: MARIGOLD });
    const charlieTile = pressable(tree, 'Charlie');
    expect(flat(charlieTile.props.style).borderColor).not.toBe(MARIGOLD);
  });

  it('drops the card once the call has ended, and the group returns to its tile', async () => {
    const ended: LiveCall = { ...callA, ends_at: new Date(T0 - 1000).toISOString() };
    const { tree } = await renderHome({ groups, liveCalls: [ended] });

    expect(hasText(tree, 'Join')).toBe(false);
    expect(allText(tree).filter((t) => t === 'Alpha')).toHaveLength(1);
    expect(marigoldNodes(tree, 'dark')).toHaveLength(1); // back to the tab underline alone
  });

  it('keeps the card across the cadence filters, but not on the Invited tab', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA], invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Weekly');
    expect(hasText(tree, 'Join')).toBe(true);

    await press(tree, 'Invited');
    expect(hasText(tree, 'Join')).toBe(false);
  });

  // Date stays on the spy above; the promise machinery the load chain relies on stays
  // real. setTimeout and setInterval are faked — the screen uses one, the countdown
  // the other.
  const fakeTimers = () =>
    jest.useFakeTimers({ doNotFake: ['Date', 'setImmediate', 'nextTick', 'queueMicrotask'] });

  it('ticks the countdown down by the second, and drops the card the moment the call ends', async () => {
    fakeTimers();
    try {
      const { tree } = await renderHome({ groups, liveCalls: [callA] });
      expect(hasText(tree, '12:04')).toBe(true);

      advanceClock(5_000);
      await act(async () => { jest.advanceTimersByTime(5_000); });
      expect(hasText(tree, '11:59')).toBe(true);

      // The end. The screen's own timeout — not a per-second tick — takes the card
      // away rather than leaving it reading 0:00.
      advanceClock(719_000);
      await act(async () => { jest.advanceTimersByTime(719_000); });
      expect(hasText(tree, 'Join')).toBe(false);
      expect(allText(tree).some(looksLikeCountdown)).toBe(false);
      expect(allText(tree).filter((t) => t === 'Alpha')).toHaveLength(1); // its tile is back
    } finally {
      jest.useRealTimers();
    }
  });

  // The point of the two clocks: the countdown text re-renders itself every second,
  // and the screen — header, tabs, every tile — renders only when a call ends.
  it('re-renders only the countdown each second, and the screen only when the call ends', async () => {
    fakeTimers();
    try {
      const { tree } = await renderHome({ groups, liveCalls: [callA] });
      const tileRenders = () => (GroupTile as jest.Mock).mock.calls.length;
      const settled = tileRenders();
      expect(settled).toBeGreaterThan(0);
      expect(hasText(tree, '12:04')).toBe(true);

      for (let second = 1; second <= 3; second += 1) {
        advanceClock(1000);
        await act(async () => { jest.advanceTimersByTime(1000); });
      }
      expect(hasText(tree, '12:01')).toBe(true); // the countdown moved…
      expect(tileRenders()).toBe(settled); // …and no tile re-rendered, so neither did the screen

      // The end: one screen render. Bravo and Charlie were tiles already; Alpha
      // joins them, so the three tiles render once each.
      const beforeEnd = tileRenders();
      advanceClock(721_000);
      await act(async () => { jest.advanceTimersByTime(721_000); });
      expect(hasText(tree, 'Join')).toBe(false);
      expect(tileRenders() - beforeEnd).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('runs one 1s clock for the countdown and one timeout, at the call\'s end, for the screen', async () => {
    const setTimer = jest.spyOn(globalThis, 'setTimeout');
    const setTick = jest.spyOn(globalThis, 'setInterval');
    await renderHome({ groups, liveCalls: [callA] });

    expect(oneSecondClocks(setTick)).toHaveLength(1);
    expect(longTimeouts(setTimer)).toContain(724_000);
  });

  it('joins through the same join-token endpoint as group detail', async () => {
    const { tree, client } = await renderHome({ groups, liveCalls: [callA] });
    client.post.mockResolvedValue({ room_url: 'https://room', token: 'tok', ends_at: callA.ends_at });

    await press(tree, 'Join');

    expect(client.post).toHaveBeenCalledWith('/groups/a/calls/ca/join-token', {});
    expect(mockNavigate).toHaveBeenCalledWith('Call', {
      callId: 'ca', groupId: 'a', roomUrl: 'https://room', token: 'tok', endsAt: callA.ends_at,
    });
  });
});

describe('Home first run (no groups)', () => {
  it('draws the headline, the paste link and a marigold "Create a group" — and no filter row', async () => {
    const { tree } = await renderHome({});

    expect(hasText(tree, 'No groups yet')).toBe(true);
    expect(hasText(tree, 'Paste an invite link instead')).toBe(true);
    expect(hasText(tree, 'Create a group')).toBe(true);
    expect(hasText(tree, 'New group')).toBe(false);

    ['All', 'Daily', 'Weekly', 'Invited'].forEach((tab) => expect(hasText(tree, tab)).toBe(false));

    const bar = flat(pressable(tree, 'Create a group').props.style);
    expect(bar.backgroundColor).toBe(MARIGOLD);
  });

  it('underlines the paste link with a marigold rule, never marigold text', async () => {
    const { tree } = await renderHome({});
    const link = pressable(tree, 'Paste an invite link instead');
    const text = link.findAll((n) => isHost(n, 'Text'))[0];
    expect(flat(text.props.style).color).toBe(darkTheme.colors.text);
    const rule = link.findAll((n) => isHost(n, 'View') && flat(n.props.style).borderBottomWidth)[0];
    expect(flat(rule.props.style).borderBottomColor).toBe(MARIGOLD);
  });

  it('never flashes the empty state before the first load finishes', async () => {
    const client = mockApi({});
    // Hold the invitations request open so the screen is rendered but not yet loaded.
    let finishLoad!: () => void;
    client.getMyInvitations.mockImplementation(
      () => new Promise((resolve) => { finishLoad = () => resolve({ invitations: [] }); }),
    );
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<HomeScreen />); });
    mounted.push(tree);

    expect(hasText(tree, 'No groups yet')).toBe(false);
    expect(hasText(tree, 'Create a group')).toBe(false);
    expect(hasText(tree, 'Paste an invite link instead')).toBe(false);

    await act(async () => finishLoad());
    await flush();
    expect(hasText(tree, 'No groups yet')).toBe(true);
    expect(hasText(tree, 'Create a group')).toBe(true);
  });

  it('does not flash it while retrying after a failed load either', async () => {
    const client = mockApi({ failLoad: true });
    (useTheme as jest.Mock).mockReturnValue({ theme: darkTheme, mode: 'dark' });
    let tree!: ReactTestRenderer;
    await act(async () => { tree = renderer.create(<HomeScreen />); });
    await flush();
    mounted.push(tree);
    expect(hasText(tree, "Couldn't load groups")).toBe(true);

    // Pull to refresh: the error clears while the retry is in flight.
    let finishRetry!: () => void;
    client.getMyInvitations.mockImplementation(
      () => new Promise((resolve) => { finishRetry = () => resolve({ invitations: [] }); }),
    );
    client.get.mockImplementation(async (path: string) => (path === '/groups' ? { groups: [] } : ME));
    const refresh = tree.root.findByType(RefreshControl);
    await act(async () => { refresh.props.onRefresh(); });

    expect(hasText(tree, 'No groups yet')).toBe(false);
    expect(hasText(tree, 'Create a group')).toBe(false);

    await act(async () => finishRetry());
    await flush();
    expect(hasText(tree, 'No groups yet')).toBe(true);
  });

  it('keeps the filter row when only an invitation is pending, or the Invited tab is unreachable', async () => {
    const { tree } = await renderHome({ invitations: [invitation('i1', 'Book Club')] });
    expect(hasText(tree, 'Invited')).toBe(true);
    expect(hasText(tree, 'No groups yet')).toBe(true);
    await press(tree, 'Invited');
    expect(hasText(tree, 'Book Club')).toBe(true);
  });

  it('pastes an invite link through to the join screen', async () => {
    const { tree } = await renderHome({});
    await press(tree, 'Paste an invite link instead');

    const input = tree.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('orbit://invite/AB12CD34'));
    await press(tree, 'Continue');

    expect(mockNavigate).toHaveBeenCalledWith('JoinInvite', { code: 'AB12CD34' });
  });

  it('rejects something that is not an invite link, and stays open', async () => {
    const { tree } = await renderHome({});
    await press(tree, 'Paste an invite link instead');

    await act(async () => tree.root.findByType(TextInput).props.onChangeText('hello there'));
    await press(tree, 'Continue');

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(hasText(tree, "That doesn't look like an invite link.")).toBe(true);
  });
});

describe('Home load failure', () => {
  it('says so, keeps the filters, and does not claim the user has no groups', async () => {
    const { tree } = await renderHome({ failLoad: true });

    expect(hasText(tree, "Couldn't load groups")).toBe(true);
    expect(hasText(tree, 'No groups yet')).toBe(false);
    expect(hasText(tree, 'Daily')).toBe(true);
    expect(hasText(tree, 'New group')).toBe(true);
  });
});

// ─── Loading: focus, overlap, and failure ─────────────────────────────────────

describe('Home loading', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reloads when the screen regains focus', async () => {
    const { client } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    const before = groupLoads(client);

    await act(async () => mockListeners.focus());
    await flush();

    expect(groupLoads(client)).toBe(before + 1);
  });

  it('lets the newest load win: an older failure landing late does not re-raise the error', async () => {
    const { tree, client } = await renderHome({});
    expect(hasText(tree, 'No groups yet')).toBe(true);

    // Two loads overlap, as they do on a cold start (mount + the initial 'focus').
    // The older one fails, but only after the newer one has succeeded.
    let failOlder!: () => void;
    client.getMyInvitations
      .mockImplementationOnce(() => new Promise((_, reject) => { failOlder = () => reject(new Error('late')); }))
      .mockImplementationOnce(async () => ({ invitations: [] }));
    await act(async () => {
      mockListeners.focus();
      mockListeners.focus();
    });
    await flush();

    await act(async () => failOlder());
    await flush();

    expect(hasText(tree, "Couldn't load groups")).toBe(false);
    expect(hasText(tree, 'No groups yet')).toBe(true);
  });

  it('lets the newest load win: an older success landing late does not replace newer data', async () => {
    const { tree, client } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });

    let resolveOlder!: () => void;
    client.getMyInvitations
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveOlder = () => resolve({ invitations: [invitation('i1', 'Stale Club')] }); }),
      )
      .mockImplementationOnce(async () => ({ invitations: [] }));
    await act(async () => {
      mockListeners.focus();
      mockListeners.focus();
    });
    await flush();
    await act(async () => resolveOlder());
    await flush();

    expect(hasText(tree, '1')).toBe(false); // no Invited badge from the stale response
  });

  it('says the load failed — not "No all groups" — for a user whose only content is an invitation', async () => {
    const { tree, client } = await renderHome({ invitations: [invitation('i1', 'Book Club')] });
    // The first load saved a copy, and a failed reload would now draw it. This is the
    // no-copy case — the error state — so take the copy away first.
    await AsyncStorage.clear();
    client.get.mockRejectedValue(new Error('offline'));

    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    await flush();

    expect(hasText(tree, "Couldn't load groups")).toBe(true);
    expect(hasText(tree, 'No all groups')).toBe(false);
  });

  it('says the load failed, rather than that a filter is empty, when it fails on a filter', async () => {
    const { tree, client } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha', cadence: 'daily' })] });
    await press(tree, 'Weekly');
    expect(hasText(tree, 'No weekly groups')).toBe(true);

    // As above: with a saved copy the reload would draw it; this is the no-copy case.
    await AsyncStorage.clear();
    client.get.mockRejectedValue(new Error('offline'));
    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    await flush();

    expect(hasText(tree, "Couldn't load groups")).toBe(true);
    expect(hasText(tree, 'No weekly groups')).toBe(false);
  });
});

// ─── Answering an invitation ──────────────────────────────────────────────────

describe('Home answering invitations', () => {
  const two = {
    groups: [group({ id: 'a', name: 'Alpha' })],
    invitations: [invitation('i1', 'Book Club'), invitation('i2', 'Run Club')],
  };

  it('does not strand a first-run user on an empty Invited tab when their last invitation goes', async () => {
    const { tree } = await renderHome({ invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Invited');
    expect(hasText(tree, 'Book Club')).toBe(true);

    await press(tree, 'Later');

    expect(hasText(tree, 'No pending invitations')).toBe(false);
    expect(hasText(tree, 'No groups yet')).toBe(true);
    expect(hasText(tree, 'Create a group')).toBe(true);
  });

  it('returns from Invited when a refresh finds the last invitation gone', async () => {
    const { tree, client } = await renderHome({
      groups: [group({ id: 'a', name: 'Alpha' })],
      invitations: [invitation('i1', 'Book Club')],
    });
    await press(tree, 'Invited');
    client.getMyInvitations.mockResolvedValue({ invitations: [] }); // it expired

    await act(async () => tree.root.findByType(RefreshControl).props.onRefresh());
    await flush();

    expect(hasText(tree, 'No pending invitations')).toBe(false);
    expect(hasText(tree, 'Alpha')).toBe(true);
  });

  it('still says "No pending invitations" when the user taps Invited with none', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] });
    await press(tree, 'Invited');
    expect(hasText(tree, 'No pending invitations')).toBe(true);
    expect(hasText(tree, 'Alpha')).toBe(false);
  });

  it('hands a first-run user from the invitation row to the new tile without flashing the empty state', async () => {
    const { tree, client } = await renderHome({ invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Invited');

    // Hold the reload that follows the accept open.
    let finishReload!: () => void;
    client.getMyInvitations.mockImplementationOnce(
      () => new Promise((resolve) => { finishReload = () => resolve({ invitations: [] }); }),
    );
    client.get.mockImplementation(async (path: string) =>
      path === '/groups' ? { groups: [group({ id: 'a', name: 'Alpha' })] } : ME,
    );

    await press(tree, 'Accept');

    // Mid-reload: the accepted row is still there (dimmed), and no first-run screen.
    expect(hasText(tree, 'Book Club')).toBe(true);
    expect(hasText(tree, 'No groups yet')).toBe(false);
    expect(hasText(tree, 'Create a group')).toBe(false);

    await act(async () => finishReload());
    await flush();

    expect(hasText(tree, 'Book Club')).toBe(false);
    expect(hasText(tree, 'Alpha')).toBe(true);
    expect(hasText(tree, 'No groups yet')).toBe(false);
  });

  it('drops an accepted invitation even when the reload after it fails', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    client.getMyInvitations.mockRejectedValue(new Error('offline'));

    await press(tree, 'Accept'); // i1

    expect(client.respondToInvitation).toHaveBeenCalledWith('i1', 'accept');
    expect(hasText(tree, 'Book Club')).toBe(false); // not left behind to be accepted twice
    expect(hasText(tree, 'Run Club')).toBe(true);
  });

  it('explains a rejected accept in plain words and resyncs instead of leaving a row that can only fail again', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    client.respondToInvitation.mockRejectedValueOnce(new Error('HTTP 400: {"error":"already a member"}'));
    const before = groupLoads(client);

    await press(tree, 'Accept');

    expect(alert).toHaveBeenCalledWith('Error', 'Friendly error message');
    expect(alert.mock.calls[0][1]).not.toContain('HTTP 400');
    expect(groupLoads(client)).toBe(before + 1);
  });

  it('keeps each row busy on its own while two are answered at once', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');

    const settle: Record<string, () => void> = {};
    client.respondToInvitation.mockImplementation(
      (id: string) => new Promise((resolve) => { settle[id] = () => resolve({ success: true, action: 'ok' }); }),
    );

    // Braced: returning the pending accept from act() would make act wait on it.
    await act(async () => { pressable(tree, 'Accept', 0).props.onPress(); });
    await act(async () => { pressable(tree, 'Accept', 1).props.onPress(); });
    expect(client.respondToInvitation).toHaveBeenCalledWith('i1', 'accept');
    expect(client.respondToInvitation).toHaveBeenCalledWith('i2', 'accept');
    expect(pressable(tree, 'Accept', 0).props.disabled).toBe(true);
    expect(pressable(tree, 'Accept', 1).props.disabled).toBe(true);

    // The second finishes first. The first is still in flight, so it must stay inert
    // — a re-enabled Accept here would send a duplicate.
    await act(async () => settle.i2());
    await flush();

    expect(hasText(tree, 'Run Club')).toBe(false);
    expect(hasText(tree, 'Book Club')).toBe(true);
    expect(pressable(tree, 'Accept', 0).props.disabled).toBe(true);
  });
});

// ─── The live clock follows focus ─────────────────────────────────────────────

describe('Home live clock', () => {
  const groups = [group({ id: 'a', name: 'Alpha' })];
  const call: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: new Date(T0 - 60_000).toISOString(),
    ends_at: new Date(T0 + 724_000).toISOString(), participant_count: 2,
  };
  const oneSecondClocks = (spy: jest.SpyInstance) => spy.mock.calls.filter(([, ms]) => ms === 1000);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  it('ticks while the screen is focused', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    await renderHome({ groups, liveCalls: [call] });
    expect(oneSecondClocks(started)).toHaveLength(1);
  });

  it('runs no clock while the screen is blurred, though the call is still live', async () => {
    mockIsFocused = false;
    const started = jest.spyOn(globalThis, 'setInterval');
    const { tree } = await renderHome({ groups, liveCalls: [call] });

    expect(hasText(tree, 'Join')).toBe(true);
    expect(oneSecondClocks(started)).toHaveLength(0);
  });

  it('runs no clock when nothing is live', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    await renderHome({ groups });
    expect(oneSecondClocks(started)).toHaveLength(0);
  });
});

// ─── Spontaneous calls: count up, only scheduled ones count down ──────────────

describe('Home spontaneous calls', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const groups = [
    group({ id: 'a', name: 'Alpha', member_count: 4 }),
    group({ id: 'b', name: 'Bravo' }),
    group({ id: 'c', name: 'Charlie', member_count: 6 }),
  ];
  const scheduledCall: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: iso(T0 - 900_000),
    ends_at: iso(T0 + 724_000), participant_count: 2,
  };
  const spontaneousCall: LiveCall = {
    id: 'cs', group_id: 'c', call_type: 'spontaneous', started_at: iso(T0 - 60_000),
    ends_at: null, participant_count: 3,
  };
  const looksLikeCountdown = (t: string) => /^\d+:\d{2}(:\d{2})?$/.test(t);

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  it('shows the in-progress card for a spontaneous call, counting up from when it started', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [spontaneousCall] });

    expect(hasText(tree, '3 of 6 joined')).toBe(true);
    expect(hasText(tree, 'Join')).toBe(true);
    expect(hasText(tree, 'Charlie')).toBe(true);
    expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:00']); // started 60s ago
  });

  it('draws its timer in the same marigold slot a scheduled call does', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [spontaneousCall] });

    const slot = tree.root.findAll((n) => isHost(n, 'Text') && flat(n.props.style).fontSize === Math.round(28 * 1.12))[0];
    expect(flat(slot.props.style)).toMatchObject({ color: MARIGOLD, fontVariant: ['tabular-nums'] });
  });

  it('ticks its own 1s clock, and gives the screen no timeout — nothing but the server ends it', async () => {
    const setTick = jest.spyOn(globalThis, 'setInterval');
    const setTimer = jest.spyOn(globalThis, 'setTimeout');
    await renderHome({ groups, liveCalls: [spontaneousCall] });

    expect(setTick.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(1);
    expect(setTimer.mock.calls.filter(([, ms]) => (ms as number) >= 1000)).toHaveLength(0);
  });

  describe('as time passes', () => {
    let elapsed = 0;
    const tick = (ms: number) => {
      elapsed += ms;
      return act(async () => { await jest.advanceTimersByTimeAsync(ms); });
    };

    beforeEach(() => {
      elapsed = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => T0 + elapsed);
      jest.useFakeTimers({ doNotFake: ['Date', 'setImmediate', 'nextTick', 'queueMicrotask'] });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('counts up by the second, and keeps counting however long the call runs', async () => {
      const { tree } = await renderHome({ groups, liveCalls: [spontaneousCall] });
      expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:00']);

      await tick(5_000);
      expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:05']);

      await tick(3_600_000);
      expect(hasText(tree, 'Join')).toBe(true); // never expired client-side
      expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:01:05']);
    });

    it('re-renders only the timer each second, not the screen or its tiles', async () => {
      const { tree } = await renderHome({ groups, liveCalls: [spontaneousCall] });
      const tileRenders = () => (GroupTile as jest.Mock).mock.calls.length;
      const settled = tileRenders();

      await tick(3_000);

      expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:03']); // it moved…
      expect(tileRenders()).toBe(settled); // …and no tile re-rendered
    });
  });

  it('shows elapsed time, never a blank or NaN, for a scheduled call that arrives with no end time — and logs it', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const faulty: LiveCall = { ...scheduledCall, ends_at: null };
    const { tree } = await renderHome({ groups, liveCalls: [faulty] });

    expect(allText(tree).filter(looksLikeCountdown)).toEqual(['15:00']); // started 900s ago
    expect(allText(tree).some((t) => /NaN/.test(t))).toBe(false);
    expect(hasText(tree, 'Join')).toBe(true); // degraded, not dropped
    expect(error.mock.calls.filter(([m]) => String(m).includes('[call-timer]'))).toHaveLength(1);
  });

  it('counts down for a scheduled call in the very same render', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [scheduledCall] });
    expect(allText(tree).filter(looksLikeCountdown)).toEqual(['12:04']);
  });

  it('is never dropped as ended, however long it has been open — only the server ends it', async () => {
    (Date.now as jest.Mock).mockReturnValue(T0 + 6 * 3_600_000);
    const { tree } = await renderHome({ groups, liveCalls: [spontaneousCall] });

    expect(hasText(tree, 'Join')).toBe(true);
    expect(allText(tree).filter((t) => t === 'Charlie')).toHaveLength(1);
  });

  it('goes when the next load says it is over', async () => {
    const { tree, client } = await renderHome({ groups, liveCalls: [spontaneousCall] });
    expect(hasText(tree, 'Join')).toBe(true);

    (fetchLiveCalls as jest.Mock).mockResolvedValue([]);
    await act(async () => mockListeners.focus());
    await flush();

    expect(hasText(tree, 'Join')).toBe(false);
    expect(groupLoads(client)).toBe(2);
  });

  it('joins like any other call, with no end time to pass along', async () => {
    const { tree, client } = await renderHome({ groups, liveCalls: [spontaneousCall] });
    client.post.mockResolvedValue({ room_url: 'https://room', token: 'tok', ends_at: null });

    await press(tree, 'Join');

    expect(client.post).toHaveBeenCalledWith('/groups/c/calls/cs/join-token', {});
    expect(mockNavigate).toHaveBeenCalledWith('Call', {
      callId: 'cs', groupId: 'c', roomUrl: 'https://room', token: 'tok', endsAt: undefined,
    });
  });

  it('ranks it against a scheduled call by when it started: the more recent takes the card', async () => {
    // Spontaneous started a minute ago, scheduled fifteen minutes ago.
    const { tree } = await renderHome({ groups, liveCalls: [scheduledCall, spontaneousCall] });

    expect(hasText(tree, '3 of 6 joined')).toBe(true); // Charlie's card
    expect(allText(tree).filter(looksLikeCountdown)).toEqual(['1:00']); // counting up, as it is the card
    // The scheduled call keeps Alpha's tile, marked live — and a tile carries no timer.
    expect(flat(pressable(tree, 'Alpha').props.style)).toMatchObject({ borderWidth: 1, borderColor: MARIGOLD });
    expect(allText(tree).filter((t) => t === 'live')).toHaveLength(1);
  });

  it('keeps a spontaneous call as a live tile when a scheduled one holds the card', async () => {
    const olderSpontaneous: LiveCall = { ...spontaneousCall, started_at: iso(T0 - 1_800_000) };
    const { tree } = await renderHome({ groups, liveCalls: [scheduledCall, olderSpontaneous] });

    expect(allText(tree).filter(looksLikeCountdown)).toEqual(['12:04']); // only the card's
    expect(flat(pressable(tree, 'Charlie').props.style)).toMatchObject({ borderWidth: 1, borderColor: MARIGOLD });
    expect(allText(tree).filter((t) => t === 'live')).toHaveLength(1);
  });

  it('gives the screen a timeout only for the scheduled call among both', async () => {
    const setTimer = jest.spyOn(globalThis, 'setTimeout');
    await renderHome({ groups, liveCalls: [scheduledCall, spontaneousCall] });
    expect(setTimer.mock.calls.map(([, ms]) => ms as number).filter((ms) => ms >= 1000)).toEqual([724_000]);
  });
});

// ─── Declining an invitation ──────────────────────────────────────────────────

describe('Home declining invitations', () => {
  const two = {
    groups: [group({ id: 'a', name: 'Alpha' })],
    invitations: [invitation('i1', 'Book Club'), invitation('i2', 'Run Club')],
  };

  type AlertButton = { text: string; style?: string; onPress?: () => void };
  const confirmDialog = (alert: jest.SpyInstance) => {
    const [title, message, buttons] = alert.mock.calls[alert.mock.calls.length - 1] as [string, string, AlertButton[]];
    return { title, message, buttons };
  };
  const chooseInDialog = async (alert: jest.SpyInstance, text: string) => {
    const button = confirmDialog(alert).buttons.find((b) => b.text === text)!;
    await act(async () => { button.onPress?.(); });
    await flush();
  };

  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('asks first, and says the decision is permanent', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');

    await press(tree, 'Decline');

    const { title, message, buttons } = confirmDialog(alert);
    expect(title).toBe('Decline invitation?');
    expect(message).toContain('jo'); // who would have to invite them again
    expect(message).toContain('Book Club');
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Decline']);
    expect(buttons[0].style).toBe('cancel');
    expect(buttons[1].style).toBe('destructive');
    expect(client.respondToInvitation).not.toHaveBeenCalled(); // nothing sent yet
  });

  it('Cancel changes nothing', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    await press(tree, 'Decline');

    await chooseInDialog(alert, 'Cancel');

    expect(client.respondToInvitation).not.toHaveBeenCalled();
    expect(hasText(tree, 'Book Club') && hasText(tree, 'Run Club')).toBe(true);
  });

  it('declines that invitation when confirmed, and the row goes', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    await press(tree, 'Decline'); // Book Club's

    await chooseInDialog(alert, 'Decline');

    expect(client.respondToInvitation).toHaveBeenCalledTimes(1);
    expect(client.respondToInvitation).toHaveBeenCalledWith('i1', 'decline');
    expect(hasText(tree, 'Book Club')).toBe(false);
    expect(hasText(tree, 'Run Club')).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1); // just the confirmation — no success alert on top
  });

  it('declines the row whose Decline was pressed, not the first', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    await press(tree, 'Decline', 1); // Run Club's

    await chooseInDialog(alert, 'Decline');

    expect(client.respondToInvitation).toHaveBeenCalledWith('i2', 'decline');
    expect(hasText(tree, 'Run Club')).toBe(false);
    expect(hasText(tree, 'Book Club')).toBe(true);
  });

  it('leaves the Invited tab for the groups when the last invitation is declined', async () => {
    const { tree } = await renderHome({ ...two, invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Invited');
    await press(tree, 'Decline');

    await chooseInDialog(alert, 'Decline');

    expect(hasText(tree, 'No pending invitations')).toBe(false);
    expect(hasText(tree, 'Alpha')).toBe(true);
  });

  it('lands a first-run user on the first-run screen after declining their only invitation', async () => {
    const { tree } = await renderHome({ invitations: [invitation('i1', 'Book Club')] });
    await press(tree, 'Invited');
    await press(tree, 'Decline');

    await chooseInDialog(alert, 'Decline');

    expect(hasText(tree, 'No pending invitations')).toBe(false);
    expect(hasText(tree, 'No groups yet')).toBe(true);
    expect(hasText(tree, 'Create a group')).toBe(true);
  });

  it('explains a rejected decline in plain words and resyncs', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    await press(tree, 'Decline');
    client.respondToInvitation.mockRejectedValueOnce(new Error('HTTP 400: {"error":"already responded"}'));
    const before = groupLoads(client);

    await chooseInDialog(alert, 'Decline');

    expect(alert).toHaveBeenLastCalledWith('Error', 'Friendly error message');
    expect(groupLoads(client)).toBe(before + 1);
    expect(hasText(tree, 'Book Club')).toBe(true); // the resync, not a guess, decides what is left
  });

  it('holds every action on the row inert while the decline is in flight', async () => {
    const { tree, client } = await renderHome(two);
    await press(tree, 'Invited');
    let settle!: () => void;
    client.respondToInvitation.mockImplementationOnce(
      () => new Promise((resolve) => { settle = () => resolve({ success: true, action: 'ok' }); }),
    );
    await press(tree, 'Decline');

    await chooseInDialog(alert, 'Decline');

    for (const label of ['Decline', 'Later', 'Accept']) {
      expect(pressable(tree, label, 0).props.disabled).toBe(true);
    }
    // The other row is untouched.
    expect(pressable(tree, 'Accept', 1).props.disabled).toBeFalsy();

    await act(async () => settle());
    await flush();
    expect(hasText(tree, 'Book Club')).toBe(false);
  });

  it('is labelled for a screen reader with the group it would decline', async () => {
    const { tree } = await renderHome(two);
    await press(tree, 'Invited');

    const decline = pressable(tree, 'Decline', 0);
    expect(decline.props.accessibilityLabel).toBe('Decline invitation to Book Club');
    expect(decline.props.accessibilityRole).toBe('button');
  });

  it.each<Mode>(['light', 'dark'])('draws Decline as plain text, never marigold (%s)', async (mode) => {
    const { tree } = await renderHome(two, mode);
    await press(tree, 'Invited');
    const { colors } = THEMES[mode];

    const decline = pressable(tree, 'Decline', 0);
    expect(JSON.stringify(flat(decline.props.style))).not.toContain(colors.accent);
    const label = decline.findAll((n) => isHost(n, 'Text'))[0];
    expect(flat(label.props.style).color).toBe(colors.textSecondary);
  });

  it('lays the row out in two: who and what on top, then Decline, Later and Accept, right-aligned', async () => {
    const { tree } = await renderHome(two);
    await press(tree, 'Invited');

    const accept = pressable(tree, 'Accept', 0);
    // RN's TouchableOpacity is a forwardRef around a class, so climb past both.
    let actions: ReactTestInstance | null = accept.parent;
    while (actions && !flat(actions.props.style).flexDirection) actions = actions.parent;
    expect(flat(actions!.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' });
    // Decline and Later sit beside Accept, in that order, Accept last.
    const order = actions!.findAll((n) => isHost(n, 'Text')).map((n) => [n.props.children].flat().join(''));
    expect(order).toEqual(['Decline', 'Later', 'Accept']);

    // The row itself stacks — its group name and meta line are above, not beside.
    let row: ReactTestInstance | null = actions!.parent;
    while (row && !(isHost(row, 'View') && flat(row.props.style).borderColor)) row = row.parent;
    expect(flat(row!.props.style).flexDirection).not.toBe('row');
  });
});

// ─── Live calls come from the server, and are asked for again every 15s ───────

describe('Home live-call polling', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const groups = [group({ id: 'a', name: 'Alpha' }), group({ id: 'b', name: 'Bravo' })];
  const call: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: iso(T0 - 60_000),
    ends_at: iso(T0 + 724_000), participant_count: 2,
  };
  const asked = () => (fetchLiveCalls as jest.Mock).mock.calls.length;
  const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    // Date stays real-and-mocked above; only the timers are faked, so the 15s interval
    // can be driven without the countdown's clock arithmetic moving.
    jest.useFakeTimers({ doNotFake: ['Date', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks for the live calls again every 15 seconds, not sooner', async () => {
    await renderHome({ groups });
    const loaded = asked();

    await tick(14_999);
    expect(asked()).toBe(loaded);
    await tick(1);
    expect(asked()).toBe(loaded + 1);
    await tick(15_000);
    expect(asked()).toBe(loaded + 2);
  });

  it('shows a call that starts while Home is open on the next poll, and drops it when it ends', async () => {
    const { tree } = await renderHome({ groups });
    expect(hasText(tree, 'Join')).toBe(false);

    (fetchLiveCalls as jest.Mock).mockResolvedValue([call]);
    await tick(15_000);
    expect(hasText(tree, 'Join')).toBe(true);
    expect(hasText(tree, '2 of 4 joined')).toBe(true);

    (fetchLiveCalls as jest.Mock).mockResolvedValue([]);
    await tick(15_000);
    expect(hasText(tree, 'Join')).toBe(false);
  });

  it('polls only the live calls — not the groups, invitations or profile', async () => {
    const { client } = await renderHome({ groups });
    const loads = groupLoads(client);

    await tick(45_000);

    expect(groupLoads(client)).toBe(loads);
    expect(client.getMyInvitations).toHaveBeenCalledTimes(1);
  });

  it('keeps the card on screen when a poll fails — a network blip is not a call ending', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [call] });
    expect(hasText(tree, 'Join')).toBe(true);

    (fetchLiveCalls as jest.Mock).mockRejectedValue(new Error('offline'));
    await tick(15_000);

    expect(hasText(tree, 'Join')).toBe(true);
  });

  it('stops polling the moment the screen loses focus', async () => {
    const { tree } = await renderHome({ groups });
    await tick(15_000);
    const before = asked();

    mockIsFocused = false;
    await act(async () => { tree.update(<HomeScreen />); });
    await tick(60_000);

    expect(asked()).toBe(before);
  });

  it('starts again when focus returns', async () => {
    const { tree } = await renderHome({ groups });
    mockIsFocused = false;
    await act(async () => { tree.update(<HomeScreen />); });
    const blurred = asked();

    mockIsFocused = true;
    await act(async () => { tree.update(<HomeScreen />); });
    await tick(15_000);

    expect(asked()).toBe(blurred + 1);
  });

  it('never starts when the screen mounts blurred', async () => {
    mockIsFocused = false;
    await renderHome({ groups });
    const loaded = asked();

    await tick(60_000);

    expect(asked()).toBe(loaded);
  });

  it('stops polling when the screen unmounts', async () => {
    const { tree } = await renderHome({ groups });
    const before = asked();

    mounted = mounted.filter((t) => t !== tree);
    act(() => tree.unmount());
    await tick(60_000);

    expect(asked()).toBe(before);
  });

  it('drops a poll that only resolves after the screen was blurred', async () => {
    const { tree } = await renderHome({ groups });
    let resolvePoll!: (calls: LiveCall[]) => void;
    (fetchLiveCalls as jest.Mock).mockReturnValueOnce(new Promise<LiveCall[]>((r) => { resolvePoll = r; }));
    await tick(15_000);

    mockIsFocused = false;
    await act(async () => { tree.update(<HomeScreen />); });
    await act(async () => { resolvePoll([call]); });

    expect(hasText(tree, 'Join')).toBe(false);
  });
});

// ─── The live calls ride along with the rest of a load ────────────────────────

describe('Home live calls on load', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const groups = [group({ id: 'a', name: 'Alpha' }), group({ id: 'b', name: 'Bravo' })];
  const call: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: iso(T0 - 60_000),
    ends_at: iso(T0 + 724_000), participant_count: 2,
  };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  // Home waits on all of a load before it draws anything, so a request that only starts
  // once the others have finished puts a full round trip on every load and every focus.
  it('asks for the live calls alongside the groups, not after them', async () => {
    const { client } = await renderHome({ groups });
    let releaseGroups!: () => void;
    client.get.mockImplementation(async (path: string) => {
      if (path === '/groups') {
        await new Promise<void>((resolve) => { releaseGroups = resolve; });
        return { groups };
      }
      if (path === '/me') return ME;
      throw new Error(`unexpected GET ${path}`);
    });
    (fetchLiveCalls as jest.Mock).mockClear();

    await act(async () => { mockListeners.focus(); });

    // /groups is still open, and the live-call request is already out.
    expect(fetchLiveCalls).toHaveBeenCalledTimes(1);
    await act(async () => { releaseGroups(); });
  });

  // A request that fails is not a call that ended — the poll already treats it so.
  it('keeps a live card that is already up when a reload cannot reach the live calls', async () => {
    const { tree, client } = await renderHome({ groups, liveCalls: [call] });
    expect(hasText(tree, 'Join')).toBe(true);

    (fetchLiveCalls as jest.Mock).mockRejectedValue(new Error('offline'));
    await act(async () => mockListeners.focus());
    await flush();

    expect(groupLoads(client)).toBe(2);
    expect(hasText(tree, 'Join')).toBe(true);
  });

  it('still draws the groups, with no load error, when the first load cannot reach the live calls', async () => {
    const { tree } = await renderHome({ groups, failLiveCalls: true });

    expect(hasText(tree, 'Alpha')).toBe(true);
    expect(hasText(tree, 'Bravo')).toBe(true);
    expect(hasText(tree, "Couldn't load groups")).toBe(false);
    expect(hasText(tree, 'Join')).toBe(false);
  });

  it('does take the card down when a reload says the call is over', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [call] });
    expect(hasText(tree, 'Join')).toBe(true);

    (fetchLiveCalls as jest.Mock).mockResolvedValue([]);
    await act(async () => mockListeners.focus());
    await flush();

    expect(hasText(tree, 'Join')).toBe(false);
  });
});

// ─── Each tile draws its own group's photo ────────────────────────────────────

describe('Home tile photos', () => {
  const STAMP = '2026-09-01T12:00:00.000Z';

  it("hands every tile its group's id, has_photo and photo_updated_at", async () => {
    (GroupTile as jest.Mock).mockClear();
    await renderHome({
      groups: [
        group({ id: 'a', name: 'Alpha', has_photo: true, photo_updated_at: STAMP }),
        group({ id: 'b', name: 'Bravo' }),
      ],
    });

    const propsFor = (name: string) =>
      (GroupTile as jest.Mock).mock.calls.map(([props]) => props).find((p) => p.name === name);
    expect(propsFor('Alpha')).toMatchObject({ groupId: 'a', hasPhoto: true, photoUpdatedAt: STAMP });
    expect(propsFor('Bravo')).toMatchObject({ groupId: 'b', hasPhoto: false, photoUpdatedAt: null });
  });
});


// ─── Offline: the saved copy (T17) ────────────────────────────────────────────

// Local time on purpose: the copy is shown in the device's own clock, so a fixed local
// hour reads the same wherever the suite runs.
const SAVED_AT = new Date(2026, 8, 19, 9, 41).getTime();
const LATER_TODAY = new Date(2026, 8, 19, 14, 5).getTime();

const seedCache = (snapshot: Partial<HomeSnapshot> = {}) =>
  AsyncStorage.setItem(
    HOME_CACHE_KEY,
    JSON.stringify({
      groups: [group({ id: 'a', name: 'Alpha' }), group({ id: 'b', name: 'Bravo' })],
      invitations: [],
      fetchedAt: SAVED_AT,
      ...snapshot,
    }),
  );
const readCache = async () => JSON.parse((await AsyncStorage.getItem(HOME_CACHE_KEY)) ?? 'null');
const tiles = (tree: ReactTestRenderer) => tree.root.findAllByType(GroupTile);
const savedLine = (tree: ReactTestRenderer) => allText(tree).find((t) => t.startsWith('Showing groups saved at'));

describe('Home offline cache (T17)', () => {
  const alpha = group({ id: 'a', name: 'Alpha' });
  const bravo = group({ id: 'b', name: 'Bravo' });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(LATER_TODAY);
  });

  it('writes { groups, invitations, fetchedAt } under orbit.cache.groups on every successful load', async () => {
    const invitations = [invitation('i1', 'Book Club')];
    await renderHome({ groups: [alpha, bravo], invitations });

    expect(HOME_CACHE_KEY).toBe('orbit.cache.groups');
    expect(await readCache()).toEqual({ groups: [alpha, bravo], invitations, fetchedAt: LATER_TODAY });
  });

  it('rewrites it on the next successful load, so the copy is always the latest good one', async () => {
    const { client } = await renderHome({ groups: [alpha] });
    expect((await readCache()).groups).toHaveLength(1);

    client.get.mockImplementation(async (path: string) => (path === '/groups' ? { groups: [alpha, bravo] } : ME));
    await act(async () => { mockListeners.focus(); });
    await flush();

    expect((await readCache()).groups.map((g: GroupDTO) => g.id)).toEqual(['a', 'b']);
  });

  it('draws the saved copy when a load fails, and says when it was saved', async () => {
    await seedCache();
    const { tree } = await renderHome({ failLoad: true });

    expect(tiles(tree).map((t) => t.props.name)).toEqual(['Alpha', 'Bravo']);
    expect(hasText(tree, 'No connection')).toBe(true);
    expect(savedLine(tree)).toMatch(/^Showing groups saved at .*9:41/); // a real time, not a placeholder
    expect(hasText(tree, "Couldn't load groups")).toBe(false); // the banner replaces the error line
  });

  it('carries the saved invitations too', async () => {
    await seedCache({ invitations: [invitation('i1', 'Book Club')] as HomeSnapshot['invitations'] });
    const { tree } = await renderHome({ failLoad: true });

    await press(tree, 'Invited');
    expect(hasText(tree, 'Book Club')).toBe(true);
  });

  it('puts the date on a copy that is not from today, where a bare time would mislead', async () => {
    await seedCache({ fetchedAt: new Date(2026, 8, 17, 9, 41).getTime() });
    const { tree } = await renderHome({ failLoad: true });

    const day = new Date(2026, 8, 17).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(savedLine(tree)).toContain(day);
    expect(savedLine(tree)).toMatch(/9:41/);
  });

  it('is the error state, not an empty grid, on a cold install with nothing saved', async () => {
    const { tree } = await renderHome({ failLoad: true });

    expect(hasText(tree, "Couldn't load groups")).toBe(true);
    expect(hasText(tree, 'No connection')).toBe(false); // no banner: there is no copy to be honest about
    expect(hasText(tree, 'No groups yet')).toBe(false);
    expect(tiles(tree)).toHaveLength(0);
  });

  it.each([
    ['unparseable', '{not json'],
    ['the wrong shape', JSON.stringify({ groups: 'nope', invitations: [], fetchedAt: 1 })],
    ['a group with no name', JSON.stringify({ groups: [{ id: 'a' }], invitations: [], fetchedAt: 1 })],
    ['no timestamp', JSON.stringify({ groups: [], invitations: [] })],
  ])('treats a saved copy that is %s as no copy at all', async (_label, raw) => {
    await AsyncStorage.setItem(HOME_CACHE_KEY, raw);
    const { tree } = await renderHome({ failLoad: true });

    expect(hasText(tree, "Couldn't load groups")).toBe(true);
    expect(hasText(tree, 'No connection')).toBe(false);
  });

  it('restores the normal render on Retry: banner gone, grid undimmed, New group live', async () => {
    await seedCache();
    const { tree } = await renderHome({ failLoad: true });
    expect(hasText(tree, 'No connection')).toBe(true);

    mockApi({ groups: [alpha, bravo, group({ id: 'c', name: 'Charlie' })] }); // the connection is back
    await press(tree, 'Retry');

    expect(hasText(tree, 'No connection')).toBe(false);
    expect(tiles(tree).map((t) => t.props.name)).toEqual(['Alpha', 'Bravo', 'Charlie']); // fresh, not saved
    expect(tree.root.findAll((n) => isHost(n, 'View') && flat(n.props.style).opacity === 0.72)).toHaveLength(0);
    expect(pressable(tree, 'New group').props.disabled).toBeFalsy();
    expect((await readCache()).groups).toHaveLength(3); // and the copy moved forward
  });

  it('keeps the banner up when Retry fails too, rather than flashing the error state', async () => {
    await seedCache();
    const { tree } = await renderHome({ failLoad: true });

    await press(tree, 'Retry');

    expect(hasText(tree, 'No connection')).toBe(true);
    expect(hasText(tree, "Couldn't load groups")).toBe(false);
    expect(tiles(tree)).toHaveLength(2);
  });

  it('holds Retry inert while a retry is in flight, instead of queueing another', async () => {
    await seedCache();
    const { tree, client } = await renderHome({ failLoad: true });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    client.get.mockImplementation(async (path: string) => {
      await gate;
      return path === '/groups' ? { groups: [alpha] } : ME;
    });
    client.getMyInvitations.mockImplementation(async () => { await gate; return { invitations: [] }; });

    await act(async () => { pressable(tree, 'Retry').props.onPress(); });
    expect(pressable(tree, 'Retry').props.disabled).toBe(true);

    release();
    await flush();
    expect(hasText(tree, 'No connection')).toBe(false);
  });

  it('lets a newer load win over a failed one that is still reading the saved copy', async () => {
    await seedCache({ groups: [group({ id: 's', name: 'Stale' })] });
    const staleRaw = await AsyncStorage.getItem(HOME_CACHE_KEY); // what the held-open read will return
    // The failed first load stops at its cache read…
    let finishRead!: (raw: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => { finishRead = resolve; }),
    );
    const { tree } = await renderHome({ failLoad: true });

    // …while a newer load — Home regaining focus — succeeds.
    mockApi({ groups: [group({ id: 'f', name: 'Fresh' })] });
    await act(async () => { mockListeners.focus(); });
    await flush();
    expect(tiles(tree).map((t) => t.props.name)).toEqual(['Fresh']);

    // The old read now lands. It must not put the stale copy, or the banner, back.
    finishRead(staleRaw);
    await flush();
    expect(tiles(tree).map((t) => t.props.name)).toEqual(['Fresh']);
    expect(hasText(tree, 'No connection')).toBe(false);
  });

  it('still loads normally when the disk will not take the copy', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    const { tree } = await renderHome({ groups: [alpha] });

    expect(tiles(tree)).toHaveLength(1);
    expect(hasText(tree, "Couldn't load groups")).toBe(false);
    expect(hasText(tree, 'No connection')).toBe(false);
  });

  it('writes nothing for a load that lands after the account signed out, though Home is still mounted', async () => {
    const { client } = await renderHome({ groups: [alpha] });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    client.get.mockImplementation(async (path: string) => {
      await gate;
      return path === '/groups' ? { groups: [alpha] } : ME;
    });
    client.getMyInvitations.mockImplementation(async () => { await gate; return { invitations: [] }; });

    await act(async () => { mockListeners.focus(); }); // a load begins…
    await clearHomeCache(); // …the account signs out; Home is up until the session flips…
    release();
    await flush(); // …and the load lands.

    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
  });

  it('drops an invitation that lapsed while the copy sat on disk — offline cannot say so, and Accept could only fail', async () => {
    const lapsed = { ...invitation('i1', 'Old Club'), expires_at: new Date(LATER_TODAY - 60_000).toISOString() };
    const open = { ...invitation('i2', 'Open Club'), expires_at: new Date(LATER_TODAY + 3_600_000).toISOString() };
    await seedCache({ invitations: [lapsed, open] as HomeSnapshot['invitations'] });
    const { tree } = await renderHome({ failLoad: true });

    await press(tree, 'Invited');
    expect(hasText(tree, 'Open Club')).toBe(true);
    expect(hasText(tree, 'Old Club')).toBe(false);
  });

  it('writes nothing for a load that lands after Home is gone — a logout must stay cleared', async () => {
    const { tree, client } = await renderHome({ groups: [alpha] });
    await AsyncStorage.clear(); // what signing out does
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    client.get.mockImplementation(async (path: string) => {
      await gate;
      return path === '/groups' ? { groups: [alpha] } : ME;
    });
    client.getMyInvitations.mockImplementation(async () => { await gate; return { invitations: [] }; });

    await act(async () => { mockListeners.focus(); }); // a load starts…
    act(() => tree.unmount()); // …Home goes with the session…
    release();
    await flush(); // …and it lands.

    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
  });
});

// ─── Offline: what the screen looks like ──────────────────────────────────────

describe.each<Mode>(['light', 'dark'])('Home offline presentation (%s)', (mode) => {
  const { colors } = THEMES[mode];
  const offline = (fixture: Fixture = {}) => renderHome({ failLoad: true, ...fixture }, mode);

  beforeEach(async () => {
    jest.spyOn(Date, 'now').mockReturnValue(LATER_TODAY);
    await seedCache();
  });

  it('draws the banner: radius.xl, surface, hairline border, a 20pt wifi-off in textSecondary, and a 44pt Retry', async () => {
    const { tree } = await offline();

    const banner = tree.root.findAll((n) => isHost(n, 'View') && n.props.accessibilityRole === 'alert')[0];
    expect(flat(banner.props.style)).toMatchObject({
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderColor: colors.hairline,
      borderWidth: 1,
    });
    const icon = tree.root.findAllByType(Icon).find((i) => i.props.name === 'wifi-off');
    expect(icon?.props).toMatchObject({ size: 20, color: colors.textSecondary });
    expect(flat(pressable(tree, 'Retry').props.style).minHeight).toBe(44);
  });

  it('sets the two lines in the designed type: Geist 600 14.5, then Gelasio 13.5', async () => {
    const { tree } = await offline();
    const style = (text: string) =>
      flat(tree.root.findAll((n) => isHost(n, 'Text') && [n.props.children].flat().join('') === text)[0].props.style);

    expect(style('No connection')).toMatchObject({ fontFamily: 'Geist_600SemiBold', fontSize: 14.5 });
    expect(style(savedLine(tree)!)).toMatchObject({ fontFamily: 'Gelasio_400Regular', fontSize: 13.5 });
  });

  it('dims the grid to 72% — the tiles, not the banner', async () => {
    const { tree } = await offline();

    const dimmed = tree.root.findAll((n) => isHost(n, 'View') && flat(n.props.style).opacity === 0.72);
    expect(dimmed).toHaveLength(1);
    expect(dimmed[0].findAllByType(GroupTile)).toHaveLength(2);
    expect(dimmed[0].findAll((n) => n.props.accessibilityRole === 'alert')).toHaveLength(0);
  });

  it('leaves the grid at full strength when online', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] }, mode);
    expect(tree.root.findAll((n) => isHost(n, 'View') && flat(n.props.style).opacity === 0.72)).toHaveLength(0);
  });

  it('turns the active tab underline from marigold to borderStrong — nothing is live, so nothing is marigold', async () => {
    const { tree } = await offline();

    const rule = pressable(tree, 'All').findAll((n) => isHost(n, 'View') && flat(n.props.style).height === 2)[0];
    expect(flat(rule.props.style).backgroundColor).toBe(colors.borderStrong);
    expect(marigoldNodes(tree, mode)).toHaveLength(0);
  });

  it('makes New group inert, with its caption beneath', async () => {
    const { tree } = await offline();

    const button = pressable(tree, 'New group');
    expect(button.props.disabled).toBe(true);
    expect(flat(button.props.style).backgroundColor).toBe(colors.controlTrack);
    expect(hasText(tree, 'Creating groups needs a connection.')).toBe(true);
  });

  it('says none of it online: no caption, and New group answers', async () => {
    const { tree } = await renderHome({ groups: [group({ id: 'a', name: 'Alpha' })] }, mode);

    expect(hasText(tree, 'Creating groups needs a connection.')).toBe(false);
    expect(pressable(tree, 'New group').props.disabled).toBeFalsy();
  });

  it('takes the first-run primary action offline too — creating a group needs the server either way', async () => {
    await seedCache({ groups: [] });
    const { tree } = await offline();

    expect(hasText(tree, 'No groups yet')).toBe(true);
    expect(pressable(tree, 'Create a group').props.disabled).toBe(true);
    expect(hasText(tree, 'Creating groups needs a connection.')).toBe(true);
  });
});

// ─── Offline shows nothing live ───────────────────────────────────────────────

describe('Home offline and live calls', () => {
  const groups = [group({ id: 'a', name: 'Alpha', member_count: 4 }), group({ id: 'b', name: 'Bravo' })];
  const call: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: new Date(T0 - 60_000).toISOString(),
    ends_at: new Date(T0 + 724_000).toISOString(), participant_count: 2,
  };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  it('takes the live card down when the connection goes mid-session, and puts it back on Retry', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [call] });
    expect(hasText(tree, '2 of 4 joined')).toBe(true);

    mockApi({ groups, liveCalls: [call], failLoad: true }); // the connection goes
    await act(async () => { mockListeners.focus(); });
    await flush();

    expect(hasText(tree, 'No connection')).toBe(true);
    // Nothing is live, so nothing is marigold: no card, no Join, no live tile.
    expect(hasText(tree, '2 of 4 joined')).toBe(false);
    expect(hasText(tree, 'Join')).toBe(false);
    expect(marigoldNodes(tree, 'dark')).toHaveLength(0);
    expect(tiles(tree).map((t) => t.props.name)).toEqual(['Alpha', 'Bravo']); // Alpha is a plain tile again
    expect(tiles(tree).every((t) => !t.props.live)).toBe(true);
    expect(overlayUp(tree)).toBe(false);

    mockApi({ groups, liveCalls: [call] }); // and it comes back
    await press(tree, 'Retry');
    expect(hasText(tree, '2 of 4 joined')).toBe(true);
    expect(hasText(tree, 'No connection')).toBe(false);
  });

  it('agrees with a cold start offline, which never had a live call to show', async () => {
    await seedCache({ groups });
    const { tree } = await renderHome({ groups, liveCalls: [call], failLoad: true });

    expect(hasText(tree, '2 of 4 joined')).toBe(false);
    expect(marigoldNodes(tree, 'dark')).toHaveLength(0);
  });
});

// ─── The spotlight overlay: when Home raises it ───────────────────────────────

const overlayUp = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => isHost(n, 'View') && n.props.testID === 'call-spotlight').length > 0;


describe('Home spotlight', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const groups = [
    group({ id: 'a', name: 'Alpha', member_count: 4 }),
    group({ id: 'b', name: 'Bravo' }),
    group({ id: 'c', name: 'Charlie' }),
  ];
  const callA: LiveCall = {
    id: 'ca', group_id: 'a', call_type: 'scheduled', started_at: iso(T0 - 60_000),
    ends_at: iso(T0 + 724_000), participant_count: 2,
  };
  const callB: LiveCall = {
    id: 'cb', group_id: 'b', call_type: 'scheduled', started_at: iso(T0 - 300_000),
    ends_at: iso(T0 + 544_000), participant_count: 1,
  };
  const spontaneous: LiveCall = {
    id: 'cs', group_id: 'c', call_type: 'spontaneous', started_at: iso(T0 - 30_000),
    ends_at: null, participant_count: 1,
  };
  const overlay = (tree: ReactTestRenderer) =>
    tree.root.findAll((n) => isHost(n, 'View') && n.props.testID === 'call-spotlight');
  const dismiss = () => act(async () => { mockSpotlightProps!.onDismiss(); });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
  });

  it('goes up when Home opens on a live call — for that call, with that group', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });

    expect(overlay(tree)).toHaveLength(1);
    expect(mockSpotlightProps?.call.id).toBe('ca');
    expect(mockSpotlightProps?.group.name).toBe('Alpha');
    expect(mockSpotlightProps?.active).toBe(true);
  });

  it('does not go up when nothing is live', async () => {
    const { tree } = await renderHome({ groups });
    expect(overlay(tree)).toHaveLength(0);
  });

  it('is for the call that started most recently when two are live, whatever its type', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callB, spontaneous, callA] });

    expect(overlay(tree)).toHaveLength(1);
    expect(mockSpotlightProps?.call.id).toBe('cs'); // started 30s ago, against 60s and 5min
  });

  it('goes up for a spontaneous call as much as a scheduled one', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [spontaneous] });
    expect(overlay(tree)).toHaveLength(1);
    expect(mockSpotlightProps?.call.call_type).toBe('spontaneous');
  });

  it('is not raised for a call in a group the user cannot see', async () => {
    const stranger: LiveCall = { ...callA, id: 'cx', group_id: 'not-mine' };
    const { tree } = await renderHome({ groups, liveCalls: [stranger] });
    expect(overlay(tree)).toHaveLength(0);
  });

  it('comes down on Dismiss, leaving the live card in the grid', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    expect(overlay(tree)).toHaveLength(1);

    await dismiss();

    expect(overlay(tree)).toHaveLength(0);
    expect(hasText(tree, '2 of 4 joined')).toBe(true); // the card was there all along
    expect(hasText(tree, 'Join')).toBe(true);
  });

  it('does not come back this session — not when Home reloads, not for another call', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    await dismiss();

    (fetchLiveCalls as jest.Mock).mockResolvedValue([callA, callB]);
    await act(async () => { mockListeners.focus(); });
    await flush();

    expect(overlay(tree)).toHaveLength(0);
    expect(hasText(tree, '2 of 4 joined')).toBe(true); // the live data did arrive
  });

  it('stays down through a trip to another screen and back — blur, then focus', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    await dismiss();

    mockIsFocused = false; // a group is opened…
    await act(async () => { tree.update(<HomeScreen />); });
    mockIsFocused = true; // …and closed again, the call still live
    await act(async () => { tree.update(<HomeScreen />); });

    expect(overlay(tree)).toHaveLength(0);
    expect(hasText(tree, '2 of 4 joined')).toBe(true);
  });

  it('stays down through a spell offline and back, though the call is still live', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] }); // saves the copy
    await dismiss();

    // Losing the connection and getting it back re-runs the very condition the overlay
    // waits on. Being dismissed is not undone by it.
    const client = mockApi({ groups, liveCalls: [callA], failLoad: true });
    await act(async () => { mockListeners.focus(); });
    await flush();
    expect(client.get).toHaveBeenCalled();
    mockApi({ groups, liveCalls: [callA] });
    await act(async () => { mockListeners.focus(); });
    await flush();

    expect(overlay(tree)).toHaveLength(0);
  });

  it('keeps nothing on disk: dismissal is component state, so the next cold start raises it again', async () => {
    const first = await renderHome({ groups, liveCalls: [callA] });
    await dismiss();
    expect(await AsyncStorage.getAllKeys()).toEqual([HOME_CACHE_KEY]); // only the offline copy

    act(() => first.tree.unmount()); // a cold start is a fresh Home
    const second = await renderHome({ groups, liveCalls: [callA] });
    expect(overlay(second.tree)).toHaveLength(1);
  });

  it('is answered by Join as well: it comes down, joins, and stays down when Home reloads on the way back', async () => {
    const { tree, client } = await renderHome({ groups, liveCalls: [callA] });
    client.post.mockResolvedValue({ room_url: 'https://room', token: 'tok', ends_at: callA.ends_at });

    await act(async () => { mockSpotlightProps!.onJoin(); });
    await flush();

    expect(client.post).toHaveBeenCalledWith('/groups/a/calls/ca/join-token', {});
    expect(mockNavigate).toHaveBeenCalledWith('Call', {
      callId: 'ca', groupId: 'a', roomUrl: 'https://room', token: 'tok', endsAt: callA.ends_at,
    });
    expect(overlay(tree)).toHaveLength(0);

    await act(async () => { mockListeners.focus(); }); // back from the call, still live
    await flush();
    expect(overlay(tree)).toHaveLength(0);
  });

  it('waits while Home is showing a saved copy, and goes up when a retry reaches a live call', async () => {
    await seedCache();
    const { tree } = await renderHome({ failLoad: true, liveCalls: [callA] });
    expect(overlay(tree)).toHaveLength(0); // nothing known to be live

    mockApi({ groups, liveCalls: [callA] });
    await press(tree, 'Retry');

    expect(overlay(tree)).toHaveLength(1);
  });

  it('waits while Home is blurred, and goes up when it is focused', async () => {
    mockIsFocused = false;
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    expect(overlay(tree)).toHaveLength(0);

    mockIsFocused = true;
    await act(async () => { tree.update(<HomeScreen />); });
    expect(overlay(tree)).toHaveLength(1);
  });

  it('hides the screen behind it from screen readers while it is up, and only then', async () => {
    const { tree } = await renderHome({ groups, liveCalls: [callA] });
    const hiders = () => tree.root.findAll((n) => isHost(n, 'View') && n.props.importantForAccessibility === 'no-hide-descendants');

    expect(hiders()).toHaveLength(1);
    expect(hiders()[0].props.accessibilityElementsHidden).toBe(true);
    expect(hiders()[0].findAllByType(GroupTile).length).toBeGreaterThan(0);

    await dismiss();
    expect(hiders()).toHaveLength(0);
  });

  describe('as time passes', () => {
    // Timers are faked; the wall clock is moved by hand alongside them, as a device's is.
    let elapsed = 0;
    const tick = (ms: number) => {
      elapsed += ms;
      return act(async () => { await jest.advanceTimersByTimeAsync(ms); });
    };

    beforeEach(() => {
      elapsed = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => T0 + elapsed);
      jest.useFakeTimers({ doNotFake: ['Date', 'setImmediate', 'nextTick', 'queueMicrotask'] });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('is raised for a call that was live when Home opened, not for one that starts while it is open', async () => {
      const { tree } = await renderHome({ groups });
      expect(overlay(tree)).toHaveLength(0);

      (fetchLiveCalls as jest.Mock).mockResolvedValue([callA]);
      await tick(15_000); // the poll finds a new call

      expect(hasText(tree, '2 of 4 joined')).toBe(true); // it gets its card…
      expect(overlay(tree)).toHaveLength(0); // …not an overlay dropped on whatever the user is doing
    });

    it('goes when its call ends, rather than moving to whichever call is live next', async () => {
      // Older than callA, so it is not the hero — and it outlives callA by five minutes.
      const callC: LiveCall = {
        id: 'cc', group_id: 'c', call_type: 'scheduled', started_at: iso(T0 - 400_000),
        ends_at: iso(T0 + 1_000_000), participant_count: 1,
      };
      const { tree } = await renderHome({ groups, liveCalls: [callA, callC] });
      expect(mockSpotlightProps?.call.id).toBe('ca');

      await tick(724_000); // callA's end

      expect(overlay(tree)).toHaveLength(0); // not re-pointed at callC…
      expect(hasText(tree, '1 of 4 joined')).toBe(true); // …which is live, and now holds the card
    });
  });
});
