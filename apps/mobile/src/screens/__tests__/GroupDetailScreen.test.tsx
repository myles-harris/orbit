import { act } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, VirtualizedList } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import GroupDetailScreen from '../GroupDetailScreen';
import { useTheme } from '../../context/ThemeContext';
import { BottomActionBar } from '../../components/BottomActionBar';
import { GroupPhotoHeader } from '../../components/GroupPhotoHeader';
import { createAuthenticatedApiClient } from '../../utils/apiClient';
import { allText, textOf } from '../../testUtils/tree';
import { darkTheme, lightTheme } from '../../theme';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockViewerTz = 'America/New_York';
const mockNavigation = {
  goBack: mockGoBack,
  navigate: mockNavigate,
  replace: mockReplace,
  canGoBack: () => mockCanGoBack,
  addListener: jest.fn(() => jest.fn()),
};

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  createAuthenticatedApiClient: jest.fn(),
  API_URL: 'http://test',
  // A token in the in-memory cache, so an avatar can paint on the first frame.
  peekAccessToken: () => 'tok',
  getAccessToken: async () => 'tok',
}));
jest.mock('../../components/LightStatusBar', () => ({ LightStatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { groupId: 'g1' } }),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: mockViewerTz }] }));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;
const AVATAR_STAMP = '2026-09-01T00:00:00.000Z';

const members = Array.from({ length: 14 }, (_, i) => ({
  user_id: `u${i}`,
  username: `member-${i}`,
  role: i === 0 ? 'owner' : 'member',
  // One member has a photo; the rest fall back to initials.
  has_avatar: i === 1,
  avatar_updated_at: i === 1 ? AVATAR_STAMP : null,
  time_zone: 'UTC',
}));

const GROUP = {
  id: 'g1',
  name: 'Track Club',
  owner_id: 'u0',
  cadence: 'daily',
  weekly_frequency: null,
  call_duration_minutes: 10,
  call_window_start: 6,
  call_window_end: 22,
  time_zone: 'America/New_York',
  has_photo: false,
  photo_updated_at: null,
  is_muted: false,
  member_count: 14,
  members,
};

interface Fixture {
  me?: string;
  group?: Record<string, unknown>;
  current?: { id: string } | null;
  failLoad?: boolean;
}

function mockApi({ me = 'u0', group = GROUP, current = null, failLoad = false }: Fixture) {
  const client = {
    get: jest.fn(async (path: string) => {
      if (failLoad) throw new Error('offline');
      if (path === '/me') return { id: me };
      if (path === '/groups/g1') return group;
      if (path === '/groups/g1/calls/current') return { current };
      throw new Error(`unexpected GET ${path}`);
    }),
    post: jest.fn(async (path: string) => {
      if (path.endsWith('/call-now')) return { id: 'call-1' };
      return { room_url: 'https://room', token: 'room-token', ends_at: null };
    }),
    delete: jest.fn(async () => ({})),
  };
  (createAuthenticatedApiClient as jest.Mock).mockResolvedValue(client);
  return client;
}

let mounted: ReactTestRenderer[] = [];

async function renderDetail(fixture: Fixture = {}, mode: Mode = 'dark') {
  const client = mockApi(fixture);
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<GroupDetailScreen />);
  });
  mounted.push(tree);
  return { tree, client };
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

const has = (tree: ReactTestRenderer, text: string) => allText(tree).includes(text);
const bar = (tree: ReactTestRenderer) => tree.root.findByType(BottomActionBar).props;
const press = (tree: ReactTestRenderer, label: string) =>
  act(async () => { await tree.root.findByProps({ accessibilityLabel: label }).props.onPress(); });

const isAncestorOfType = (node: ReactTestInstance, type: unknown): boolean => {
  for (let n = node.parent; n; n = n.parent) if (n.type === type) return true;
  return false;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

// The screen polls every 10s; leaving it mounted would leak the interval.
afterEach(() => {
  mounted.forEach((t) => t.unmount());
  mounted = [];
});

// ─── The rows ─────────────────────────────────────────────────────────────────

describe('GroupDetailScreen rows', () => {
  it('shows the group, then Calls / Length / Call window', async () => {
    const { tree } = await renderDetail();
    const text = allText(tree);

    expect(text).toContain('Track Club');
    const [calls, length, callWindow] = ['Calls', 'Length', 'Call window'].map((l) => text.indexOf(l));
    expect(calls).toBeGreaterThan(-1);
    expect(length).toBeGreaterThan(calls);
    expect(callWindow).toBeGreaterThan(length);
    expect(text).toContain('Daily');
    expect(text).toContain('10 min');
    expect(text).toContain('6 AM – 10 PM');
  });

  it('reads "Call window" — not "Call Window", not "Window"', async () => {
    const { tree } = await renderDetail();
    expect(allText(tree).filter((t) => /window/i.test(t) && !t.includes('–'))).toEqual(['Call window']);
  });

  it('names the group’s zone beneath the window, and adds no second line when it is also yours', async () => {
    mockViewerTz = 'America/New_York';
    const { tree } = await renderDetail();
    expect(has(tree, 'America/New_York')).toBe(true);
    expect(allText(tree).some((t) => t.endsWith('your time'))).toBe(false);
  });

  it('adds the window as you see it when your zone differs', async () => {
    mockViewerTz = 'America/Los_Angeles';
    const { tree } = await renderDetail();
    // New York is three hours ahead of Los Angeles in both DST regimes.
    expect(has(tree, '3 AM – 7 PM your time')).toBe(true);
    mockViewerTz = 'America/New_York';
  });

  it('spells out a weekly cadence', async () => {
    const { tree } = await renderDetail({ group: { ...GROUP, cadence: 'weekly', weekly_frequency: 3 } });
    expect(has(tree, '3 calls per week')).toBe(true);
  });
});

// ─── The member list ──────────────────────────────────────────────────────────

describe('GroupDetailScreen members', () => {
  it('scrolls 14 members inside a fixed 122pt viewport', async () => {
    const { tree } = await renderDetail();
    const list = tree.root.findAllByType(ScrollView).find((s) => StyleSheet.flatten(s.props.style)?.height === 122)!;

    expect(list).toBeDefined();
    expect(list.props.nestedScrollEnabled).toBe(true);
    const names = list.findAll((n) => (n.type as unknown) === 'Text').map(textOf).filter((t) => /^member-\d+$/.test(t));
    expect(names).toHaveLength(14);
  });

  it('keeps the rows above and the action below out of that scroll', async () => {
    const { tree } = await renderDetail();
    const inner = tree.root.findAllByType(ScrollView).find((s) => StyleSheet.flatten(s.props.style)?.height === 122)!;
    const innerText = new Set(inner.findAll((n) => (n.type as unknown) === 'Text').map(textOf));

    // The window rows are not inside the member viewport…
    expect(innerText.has('Call window')).toBe(false);
    // …and the bottom bar is not inside any ScrollView at all, so it stays put.
    expect(isAncestorOfType(tree.root.findByType(BottomActionBar), ScrollView)).toBe(false);
  });

  it('uses no FlatList, so nothing nests a VirtualizedList in a ScrollView', async () => {
    const { tree } = await renderDetail();
    expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
    expect(tree.root.findAllByType(VirtualizedList)).toHaveLength(0);
  });

  it('shows a member’s photo when they have one, and their initial when they don’t', async () => {
    const { tree } = await renderDetail();
    const photos = tree.root.findAllByType(Image).map((i) => i.props.source);

    expect(photos).toHaveLength(1);
    expect(photos[0].uri).toBe(`http://test/users/u1/avatar?v=${new Date(AVATAR_STAMP).getTime()}`);
    expect(photos[0].headers).toEqual({ Authorization: 'Bearer tok' });
    // member-2 has no photo: 36pt of initial instead.
    expect(allText(tree).filter((t) => t === 'M').length).toBeGreaterThanOrEqual(12);
  });

  it('draws member avatars at 36pt', async () => {
    const { tree } = await renderDetail();
    expect(StyleSheet.flatten(tree.root.findByType(Image).props.style)).toMatchObject({ width: 36, height: 36 });
  });

  it('marks the owner in the list, without a marigold pill', async () => {
    const { tree } = await renderDetail({}, 'light');
    expect(allText(tree).filter((t) => t === 'Owner')).toHaveLength(1);
    const colours = tree.root.findAll((n) => (n.type as unknown) === 'Text').map((n) => StyleSheet.flatten(n.props.style)?.color);
    expect(colours).not.toContain(lightTheme.colors.accent);
  });
});

// ─── Owner-only controls ──────────────────────────────────────────────────────

describe('GroupDetailScreen owner controls', () => {
  it('gives the owner an Invite link and a Remove on every other member', async () => {
    const { tree } = await renderDetail({ me: 'u0' });
    expect(has(tree, 'Invite')).toBe(true);
    expect(allText(tree).filter((t) => t === 'Remove')).toHaveLength(13);
    await press(tree, 'Invite a member');
    expect(mockNavigate).toHaveBeenCalledWith('InviteUser', { groupId: 'g1' });
  });

  it('gives a member neither', async () => {
    const { tree } = await renderDetail({ me: 'u2' });
    expect(has(tree, 'Invite')).toBe(false);
    expect(has(tree, 'Remove')).toBe(false);
  });

  it('confirms before removing, then reloads', async () => {
    const { tree, client } = await renderDetail({ me: 'u0' });
    await press(tree, 'Remove member-3');

    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Remove Member');
    await act(async () => { await buttons.find((b: { text: string }) => b.text === 'Remove').onPress(); });
    expect(client.delete).toHaveBeenCalledWith('/groups/g1/members/u3');
  });

  it('opens settings with the viewer’s ownership', async () => {
    const owner = await renderDetail({ me: 'u0' });
    await press(owner.tree, 'Group settings');
    expect(mockNavigate).toHaveBeenLastCalledWith('GroupSettings', { groupId: 'g1', isOwner: true });

    const member = await renderDetail({ me: 'u2' });
    await press(member.tree, 'Group settings');
    expect(mockNavigate).toHaveBeenLastCalledWith('GroupSettings', { groupId: 'g1', isOwner: false });
  });

  // The photo header reserves 300pt, and with no photo that was an empty block above the
  // title. Now the header is only its glyphs and the title moves up under them.
  it.each<Mode>(['light', 'dark'])('leaves no empty block above the title when the group has no photo (%s)', async (mode) => {
    const { tree } = await renderDetail({}, mode);

    expect(tree.root.findByType(GroupPhotoHeader).props.hasPhoto).toBe(false);
    const heights = tree.root
      .findAll((n) => typeof n.type === 'string')
      .map((n) => StyleSheet.flatten(n.props.style)?.height)
      .filter((h): h is number => typeof h === 'number');
    expect(heights).not.toContain(288); // the photo backdrop's height
    expect(heights).not.toContain(300); // the whole photo header's
    expect(has(tree, 'Track Club')).toBe(true);
  });

  it("draws the photo header from the group's has_photo and photo_updated_at", async () => {
    const stamp = '2026-09-02T00:00:00.000Z';
    const { tree } = await renderDetail({ group: { ...GROUP, has_photo: true, photo_updated_at: stamp } });

    expect(tree.root.findByType(GroupPhotoHeader).props).toMatchObject({
      groupId: 'g1',
      hasPhoto: true,
      photoUpdatedAt: stamp,
    });
    const sources = tree.root.findAllByType(Image).map((i) => i.props.source);
    expect(sources).toContainEqual({
      uri: `http://test/groups/g1/photo?v=${Date.parse(stamp)}`,
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('goes back from the header chevron', async () => {
    const { tree } = await renderDetail();
    await press(tree, 'Back');
    expect(mockGoBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // A cold orbit://group/:id link opens with this screen alone on the stack (the
  // linking config has no initialRouteName), so goBack() would do nothing.
  it('replaces itself with Home when nothing is beneath it, so Back is never dead', async () => {
    mockCanGoBack = false;
    const { tree } = await renderDetail();
    await press(tree, 'Back');
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('Home');
  });
});

// ─── The one primary action ───────────────────────────────────────────────────

describe('GroupDetailScreen primary action', () => {
  it('is "Start call now" in the bottom bar, and starts a call', async () => {
    const { tree, client } = await renderDetail();
    expect(bar(tree)).toMatchObject({ label: 'Start call now' });
    await act(async () => { await bar(tree).onPress(); });

    expect(client.post).toHaveBeenCalledWith('/groups/g1/call-now', {});
    expect(mockNavigate).toHaveBeenCalledWith('Call', expect.objectContaining({ callId: 'call-1', groupId: 'g1' }));
  });

  it('becomes "Join call" while a call is live, so a second one is never started', async () => {
    const { tree, client } = await renderDetail({ current: { id: 'live-1' } });
    expect(bar(tree)).toMatchObject({ label: 'Join call' });
    await act(async () => { await bar(tree).onPress(); });

    expect(client.post).not.toHaveBeenCalledWith('/groups/g1/call-now', {});
    expect(client.post).toHaveBeenCalledWith('/groups/g1/calls/live-1/join-token', {});
    expect(mockNavigate).toHaveBeenCalledWith('Call', expect.objectContaining({ callId: 'live-1' }));
  });
});

// ─── Loading and failure ──────────────────────────────────────────────────────

describe('GroupDetailScreen when the group has not loaded', () => {
  it('offers Retry and a way back, since the navigator header is off', async () => {
    const { tree, client } = await renderDetail({ failLoad: true });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(has(tree, 'Could not load group details.')).toBe(true);
    expect(tree.root.findAllByType(BottomActionBar)).toHaveLength(0);
    await press(tree, 'Back');
    expect(mockGoBack).toHaveBeenCalled();

    mockCanGoBack = false;
    await press(tree, 'Back');
    expect(mockReplace).toHaveBeenCalledWith('Home');

    client.get.mockClear();
    await act(async () => { await tree.root.findAll((n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Retry')[0].props.onPress(); });
    expect(client.get).toHaveBeenCalled();
  });
});
