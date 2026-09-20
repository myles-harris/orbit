import { act } from 'react';
import { Alert, RefreshControl, StyleSheet, TextInput } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { GroupDTO } from '@orbit/shared';
import HomeScreen from '../HomeScreen';
import { useTheme } from '../../context/ThemeContext';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { fetchLiveCalls, type LiveCall } from '../../utils/liveCalls';
import { darkTheme, lightTheme } from '../../theme';

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
}

function mockApi({ groups = [], invitations = [], liveCalls = [], failLoad = false }: Fixture) {
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
  (fetchLiveCalls as jest.Mock).mockResolvedValue(liveCalls);
  return client;
}

let mounted: ReactTestRenderer[] = [];

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
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

/** Text of every host <Text> — strings and numbers only, joined. */
function allText(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => isHost(n, 'Text'))
    .map((n) => [n.props.children].flat().filter((c) => typeof c === 'string' || typeof c === 'number').join(''));
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

async function press(tree: ReactTestRenderer, text: string) {
  const target = pressable(tree, text);
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

  it('lists one row per pending invitation under Invited, with inline Accept and Later', async () => {
    const { tree } = await renderHome(fixture);
    await press(tree, 'Invited');

    expect(hasText(tree, 'Book Club') && hasText(tree, 'Run Club')).toBe(true);
    expect(hasText(tree, 'Alpha')).toBe(false); // the grid swapped to invitations
    expect(allText(tree).filter((t) => t === 'Accept')).toHaveLength(2);
    expect(allText(tree).filter((t) => t === 'Later')).toHaveLength(2);
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
  // ends 12:04 from T0; Alpha is a 10-minute call, so it started at T0 + 124s
  const callA: LiveCall = { id: 'ca', group_id: 'a', ends_at: new Date(T0 + 724_000).toISOString(), participant_count: 2 };
  // started earlier (T0 − 56s) — the hero goes to the more recent Alpha
  const callB: LiveCall = { id: 'cb', group_id: 'b', ends_at: new Date(T0 + 544_000).toISOString(), participant_count: 1 };

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
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

  it('ticks down from ends_at, never below zero', async () => {
    // Fake only the interval: Date stays on the spy above, and the promise/timeout
    // machinery that flush() and the load chain rely on stays real.
    jest.useFakeTimers({ doNotFake: ['Date', 'setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      const { tree } = await renderHome({ groups, liveCalls: [callA] });
      expect(hasText(tree, '12:04')).toBe(true);

      (Date.now as jest.Mock).mockReturnValue(T0 + 5_000);
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(hasText(tree, '11:59')).toBe(true);

      (Date.now as jest.Mock).mockReturnValue(T0 + 800_000);
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(hasText(tree, 'Join')).toBe(false); // ended: the card is gone rather than reading 0:00
    } finally {
      jest.useRealTimers();
    }
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
    id: 'ca', group_id: 'a', ends_at: new Date(T0 + 724_000).toISOString(), participant_count: 2,
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
