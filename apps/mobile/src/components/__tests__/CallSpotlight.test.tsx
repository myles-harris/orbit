import { act, type ComponentProps } from 'react';
import { AppState, BackHandler, Image, StyleSheet } from 'react-native';
import renderer, { type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { CallSpotlight } from '../CallSpotlight';
import { useTheme } from '../../context/ThemeContext';
import { darkTheme, lightTheme, onPhoto, radius, scrim } from '../../theme';
import { peekAccessToken } from '../../utils/apiClient';
import type { LiveCall } from '../../utils/liveCalls';
import { formatTimeOfDay } from '../../utils/timeFormat';

jest.mock('../../context/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../utils/apiClient', () => ({
  API_URL: 'http://test',
  peekAccessToken: jest.fn(() => null),
  getAccessToken: jest.fn(async () => null),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const THEMES = { light: lightTheme, dark: darkTheme } as const;
type Mode = keyof typeof THEMES;
const MARIGOLD = darkTheme.colors.accent;

const T0 = Date.parse('2026-09-19T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

type SpotlightGroup = ComponentProps<typeof CallSpotlight>['group'];
const GROUP: SpotlightGroup = { id: 'g1', name: 'Track Club', member_count: 4, has_photo: false, photo_updated_at: null };

const scheduled = (over: Partial<LiveCall> = {}): LiveCall => ({
  id: 'c1', group_id: 'g1', call_type: 'scheduled',
  started_at: iso(T0 - 60_000), ends_at: iso(T0 + 724_000), participant_count: 2, ...over,
});
const spontaneous = (over: Partial<LiveCall> = {}): LiveCall => ({
  id: 'c2', group_id: 'g1', call_type: 'spontaneous',
  started_at: iso(T0 - 125_000), ends_at: null, participant_count: 2, ...over,
});

interface Rendered {
  tree: ReactTestRenderer;
  onJoin: jest.Mock;
  onDismiss: jest.Mock;
}

async function render(
  call: LiveCall,
  { mode = 'dark', group = GROUP, active = true }: { mode?: Mode; group?: SpotlightGroup; active?: boolean } = {},
): Promise<Rendered> {
  (useTheme as jest.Mock).mockReturnValue({ theme: THEMES[mode], mode });
  const onJoin = jest.fn();
  const onDismiss = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <CallSpotlight call={call} group={group} active={active} onJoin={onJoin} onDismiss={onDismiss} />,
    );
  });
  return { tree, onJoin, onDismiss };
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

const flat = (style: unknown): Record<string, any> => (StyleSheet.flatten(style as never) ?? {}) as Record<string, any>;
const isHost = (n: ReactTestInstance, name: 'Text' | 'View') => (n.type as unknown) === name;
const textOf = (n: ReactTestInstance | string): string =>
  typeof n === 'string' ? n : n.children.map(textOf).join('');

/** Every host <Text>, with what it currently draws — read from the output, so the timer
 *  (a component that renders its own string) is read the way a person would see it. */
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => isHost(n, 'Text')).map((node) => ({ node, text: textOf(node) }));
const drawn = (tree: ReactTestRenderer) => texts(tree).map((t) => t.text);
const textNode = (tree: ReactTestRenderer, text: string) => {
  const hit = texts(tree).find((t) => t.text === text);
  if (!hit) throw new Error(`no text "${text}" — have: ${drawn(tree).join(' | ')}`);
  return hit.node;
};
/** The 52pt timer: the one Display whose size is 52 × CAP_K, rounded. */
const timerNode = (tree: ReactTestRenderer) => {
  const hit = texts(tree).find((t) => flat(t.node.props.style).fontSize === Math.round(52 * 1.12));
  if (!hit) throw new Error(`no timer — have: ${drawn(tree).join(' | ')}`);
  return hit.node;
};
const pressable = (tree: ReactTestRenderer, text: string) => {
  let at: ReactTestInstance | null = textNode(tree, text);
  while (at && !at.props.onPress) at = at.parent;
  if (!at) throw new Error(`"${text}" is not pressable`);
  return at;
};
const looksLikeTimer = (t: string) => /^\d+:\d{2}(:\d{2})?$/.test(t);
const seconds = (t: string) => t.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
  // The clock listens for the app returning to the foreground; nothing here needs it.
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  (peekAccessToken as jest.Mock).mockReturnValue(null);
});

const tick = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

// ─── The designed card ────────────────────────────────────────────────────────

describe.each<Mode>(['light', 'dark'])('CallSpotlight in %s mode', (mode) => {
  const { colors } = THEMES[mode];

  it('blurs and dims what is behind it: BlurView at intensity 25 under the mode\'s espresso scrim', async () => {
    const { tree } = await render(scheduled(), { mode });

    const blur = tree.root.findByType(BlurView);
    expect(blur.props.intensity).toBe(25);
    expect(blur.props.tint).toBe(mode);
    // The design's own two values: .20 over cream, .34 over espresso.
    expect(colors.overlayScrim).toBe(mode === 'light' ? 'rgba(58,44,26,.20)' : 'rgba(58,44,26,.34)');
    const scrimView = tree.root.findAll(
      (n) => isHost(n, 'View') && flat(n.props.style).backgroundColor === colors.overlayScrim,
    );
    expect(scrimView).toHaveLength(1);
    expect(flat(scrimView[0].props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('lifts the card: radius.huge, the menu shadow, and the design\'s 26/24/22 padding', async () => {
    const { tree } = await render(scheduled(), { mode });

    const raised = tree.root.findAll(
      (n) => isHost(n, 'View') && flat(n.props.style).elevation === THEMES[mode].shadow.menu.elevation,
    );
    expect(raised).toHaveLength(1);
    expect(flat(raised[0].props.style)).toMatchObject({ borderRadius: radius.huge, shadowRadius: 32 });

    const body = tree.root.findAll(
      (n) => isHost(n, 'View') && flat(n.props.style).paddingTop === 26 && flat(n.props.style).paddingHorizontal === 24,
    );
    expect(flat(body[0].props.style).paddingBottom).toBe(22);
  });

  it('runs the vertical scrim .6 → .78 @46% → .92 over the card', async () => {
    const { tree } = await render(scheduled(), { mode });

    const gradient = tree.root.findByType(LinearGradient);
    expect(gradient.props.colors).toEqual(scrim.spotlight);
    expect(gradient.props.locations).toEqual([0, 0.46, 1]);
    expect(gradient.props.start).toBeUndefined(); // top → bottom is the default
  });

  it('sets the title in cream Display 32 at leading 1.05, with the large shadow', async () => {
    const { tree } = await render(scheduled(), { mode });

    expect(flat(textNode(tree, 'Track Club').props.style)).toMatchObject({
      fontFamily: 'Cormorant_700Bold_Italic',
      fontSize: 36, // 32 × CAP_K 1.12
      lineHeight: 38, // × 1.05
      color: onPhoto.title,
      ...onPhoto.textShadowLarge,
    });
  });

  it('draws the timer in marigold Display 52 at leading 1, in tabular figures', async () => {
    const { tree } = await render(scheduled(), { mode });

    expect(flat(timerNode(tree).props.style)).toMatchObject({
      fontFamily: 'Cormorant_700Bold_Italic',
      fontSize: 58, // 52 × CAP_K 1.12
      lineHeight: 58, // leading 1 — anything larger inflates the card
      color: MARIGOLD, // text over the dark card, the one place AC-3 allows it
      fontVariant: ['tabular-nums'],
    });
  });

  it('says how many are on the call, in Gelasio 16 wheat', async () => {
    const { tree } = await render(scheduled({ participant_count: 3 }), { mode });

    expect(flat(textNode(tree, '3 of 4 on the call').props.style)).toMatchObject({
      fontFamily: 'Gelasio_400Regular', fontSize: 16, color: onPhoto.sub,
    });
  });

  it('has a 56pt marigold "Join the call" and a 44pt "Dismiss"', async () => {
    const { tree } = await render(scheduled(), { mode });

    expect(flat(pressable(tree, 'Join the call').props.style)).toMatchObject({
      minHeight: 56, backgroundColor: colors.accent,
    });
    expect(flat(textNode(tree, 'Join the call').props.style).color).toBe(colors.onAccent);
    expect(flat(pressable(tree, 'Dismiss').props.style).minHeight).toBe(44);
  });

  it('answers Join and Dismiss', async () => {
    const { tree, onJoin, onDismiss } = await render(scheduled(), { mode });

    await act(async () => { pressable(tree, 'Join the call').props.onPress(); });
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => { pressable(tree, 'Dismiss').props.onPress(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('covers the screen and holds screen-reader focus', async () => {
    const { tree } = await render(scheduled(), { mode });
    const root = tree.root.findAll((n) => isHost(n, 'View') && n.props.accessibilityViewIsModal === true)[0];
    expect(flat(root.props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
  });
});

describe('CallSpotlight card ground', () => {
  it('is the dark surface when the group has no photo — in light mode too', async () => {
    const { tree } = await render(scheduled(), { mode: 'light' });

    expect(tree.root.findAllByType(Image)).toHaveLength(0);
    const ground = tree.root.findAll(
      (n) => isHost(n, 'View') && flat(n.props.style).backgroundColor === darkTheme.colors.surface,
    );
    expect(ground.length).toBeGreaterThan(0); // cream and marigold text are only legal over dark
  });

  it("draws the group's photo, fetched with the token, when it has one", async () => {
    (peekAccessToken as jest.Mock).mockReturnValue('tok');
    const photoGroup = { ...GROUP, has_photo: true, photo_updated_at: '2026-09-01T00:00:00.000Z' };
    const { tree } = await render(scheduled(), { group: photoGroup });

    const image = tree.root.findByType(Image);
    expect(image.props.source.uri).toBe(`http://test/groups/g1/photo?v=${Date.parse('2026-09-01T00:00:00.000Z')}`);
    expect(image.props.source.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(flat(image.props.style).borderRadius).toBe(radius.huge);
  });
});

// ─── The timer branch: what the slot draws, and what sits beneath Join ────────

describe('CallSpotlight timer (T18)', () => {
  it('counts DOWN from ends_at for a scheduled call, and says when it ends', async () => {
    const { tree } = await render(scheduled());

    expect(textOf(timerNode(tree))).toBe('12:04');
    await tick(5_000);
    expect(textOf(timerNode(tree))).toBe('11:59');
    expect(drawn(tree)).toContain(`Ends at ${formatTimeOfDay(T0 + 724_000)}`);
  });

  it('counts UP from started_at for a spontaneous call, in the same slot and style', async () => {
    const { tree } = await render(spontaneous());

    expect(textOf(timerNode(tree))).toBe('2:05');
    await tick(5_000);
    expect(textOf(timerNode(tree))).toBe('2:10');
    expect(flat(timerNode(tree).props.style)).toMatchObject({ fontSize: 58, color: MARIGOLD });
  });

  it('omits the "Ends at" line entirely for a spontaneous call — no placeholder, no dash', async () => {
    const { tree } = await render(spontaneous());

    expect(drawn(tree).filter((t) => /ends/i.test(t) || t.includes('—') || t.includes('–'))).toEqual([]);
    // Nothing else moved to make room: the card still has its title, count, Join and Dismiss.
    expect(drawn(tree)).toEqual(
      expect.arrayContaining(['Track Club', '2 of 4 on the call', 'Join the call', 'Dismiss']),
    );
  });

  it('draws the "Ends at" line for a scheduled call, and only that call', async () => {
    const withLine = await render(scheduled());
    expect(drawn(withLine.tree).filter((t) => t.startsWith('Ends at '))).toHaveLength(1);
  });

  it('shows elapsed time, never NaN, for a scheduled call with no ends_at — no "Ends at" line, and logs it', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { tree } = await render(scheduled({ ends_at: null, started_at: iso(T0 - 125_000) }));

    expect(textOf(timerNode(tree))).toBe('2:05');
    expect(drawn(tree).some((t) => /NaN/.test(t))).toBe(false);
    expect(drawn(tree).some((t) => t.startsWith('Ends at'))).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  });

  // The 52pt slot must not move while it runs. Both directions, because each crosses
  // a digit-count boundary in its own way: up gains a character at 9:59 → 10:00, down
  // loses one at 10:00 → 9:59.
  it.each([
    ['up', spontaneous({ started_at: iso(T0 - 570_000) }), 1], // 9:30, crossing 10:00
    ['down', scheduled({ ends_at: iso(T0 + 630_000) }), -1], // 10:30, crossing 9:59
  ])('holds one steady slot for a full minute counting %s', async (_direction, call, step) => {
    const { tree } = await render(call);
    const style0 = flat(timerNode(tree).props.style);
    const seen: string[] = [];

    for (let i = 0; i < 60; i += 1) {
      seen.push(textOf(timerNode(tree)));
      // The node's style is the same object-for-object at every tick: same face, same
      // size, same line box, same tabular figures — only the digits change.
      expect(flat(timerNode(tree).props.style)).toEqual(style0);
      await tick(1000);
    }

    expect(seen.every(looksLikeTimer)).toBe(true); // never NaN, never a stray character
    const values = seen.map(seconds);
    values.slice(1).forEach((v, i) => expect(v - values[i]).toBe(step)); // one second per tick, no jumps
    expect(new Set(seen.map((t) => t.length))).toEqual(new Set([4, 5])); // and the boundary was crossed
    expect(style0.fontVariant).toEqual(['tabular-nums']); // the reason the digits do not shimmy
  });

  it('runs no clock while Home is blurred', async () => {
    const started = jest.spyOn(globalThis, 'setInterval');
    await render(scheduled(), { active: false });
    expect(started.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(0);
  });
});

// ─── The hardware back button ─────────────────────────────────────────────────

describe('CallSpotlight on Android back', () => {
  const capture = () => {
    const remove = jest.fn();
    let handler!: () => boolean;
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, cb) => {
      handler = cb as () => boolean;
      return { remove };
    });
    return { add, remove, press: () => handler() };
  };

  it('dismisses instead of leaving Home, and says the press was taken', async () => {
    const back = capture();
    const { onDismiss } = await render(scheduled());

    let result: boolean | undefined;
    await act(async () => { result = back.press(); });

    expect(result).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('lets go of the back button when it goes, so a later screen has it', async () => {
    const back = capture();
    const { tree } = await render(scheduled());
    expect(back.remove).not.toHaveBeenCalled();

    act(() => tree.unmount());
    expect(back.remove).toHaveBeenCalledTimes(1);
  });
});
