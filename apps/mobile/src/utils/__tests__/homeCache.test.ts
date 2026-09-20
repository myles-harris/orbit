import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HOME_CACHE_KEY, clearHomeCache, homeCacheEpoch, readHomeCache, writeHomeCache, type HomeSnapshot,
} from '../homeCache';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const snapshot = (over: Partial<HomeSnapshot> = {}): HomeSnapshot => ({
  groups: [
    {
      id: 'a', name: 'Alpha', owner_id: 'me', cadence: 'daily', weekly_frequency: null, call_duration_minutes: 10,
      call_window_start: 6, call_window_end: 22, time_zone: 'UTC', has_photo: false, photo_updated_at: null,
      member_count: 4, members: [], created_at: '2026-01-01T00:00:00Z',
    },
  ],
  invitations: [
    { id: 'i1', invited_by: 'jo', group: { id: 'g', name: 'Book Club', cadence: 'weekly', weekly_frequency: 2, call_duration_minutes: 15, member_count: 3 } },
  ],
  fetchedAt: 1_800_000_000_000,
  ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('home cache (T17)', () => {
  it('lives under orbit.cache.groups', () => {
    expect(HOME_CACHE_KEY).toBe('orbit.cache.groups');
  });

  it('round-trips a snapshot exactly', async () => {
    await writeHomeCache(snapshot());
    expect(await readHomeCache()).toEqual(snapshot());
  });

  it('stores { groups, invitations, fetchedAt } and nothing else', async () => {
    await writeHomeCache(snapshot());
    const raw = JSON.parse((await AsyncStorage.getItem(HOME_CACHE_KEY))!);
    expect(Object.keys(raw).sort()).toEqual(['fetchedAt', 'groups', 'invitations']);
  });

  it('keeps only the latest write', async () => {
    await writeHomeCache(snapshot({ fetchedAt: 1 }));
    await writeHomeCache(snapshot({ fetchedAt: 2 }));
    expect((await readHomeCache())?.fetchedAt).toBe(2);
  });

  it('reads null when nothing was saved', async () => {
    expect(await readHomeCache()).toBeNull();
  });

  it('accepts an empty account — no groups and no invitations is a real saved state', async () => {
    await writeHomeCache(snapshot({ groups: [], invitations: [] }));
    expect(await readHomeCache()).toEqual(snapshot({ groups: [], invitations: [] }));
  });

  it.each([
    ['unparseable JSON', '{nope'],
    ['a JSON scalar', '42'],
    ['null', 'null'],
    ['groups that are not a list', JSON.stringify({ groups: {}, invitations: [], fetchedAt: 1 })],
    ['invitations that are not a list', JSON.stringify({ groups: [], invitations: 'x', fetchedAt: 1 })],
    ['a fetchedAt that is not a number', JSON.stringify({ groups: [], invitations: [], fetchedAt: '2026-09-19' })],
    ['a fetchedAt that is not finite', '{"groups":[],"invitations":[],"fetchedAt":null}'],
    ['a group with no id', JSON.stringify({ groups: [{ name: 'A' }], invitations: [], fetchedAt: 1 })],
    ['a group with no name', JSON.stringify({ groups: [{ id: 'a' }], invitations: [], fetchedAt: 1 })],
    ['an invitation with no group', JSON.stringify({ groups: [], invitations: [{ id: 'i' }], fetchedAt: 1 })],
  ])('reads null for %s, so it never reaches a render', async (_label, raw) => {
    await AsyncStorage.setItem(HOME_CACHE_KEY, raw);
    expect(await readHomeCache()).toBeNull();
  });

  it('clears the saved copy', async () => {
    await writeHomeCache(snapshot());
    await clearHomeCache();
    expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
    expect(await readHomeCache()).toBeNull();
  });

  it('clearing an empty cache is fine', async () => {
    await expect(clearHomeCache()).resolves.toBeUndefined();
  });

  // Storage is a convenience here, never a dependency: none of the three may throw into
  // the screen or the logout that call them.
  describe('when storage fails', () => {
    it('write resolves instead of rejecting', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
      await expect(writeHomeCache(snapshot())).resolves.toBeUndefined();
    });

    it('read resolves to null instead of rejecting', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('unreadable'));
      await expect(readHomeCache()).resolves.toBeNull();
    });

    it('clear resolves instead of rejecting', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('locked'));
      await expect(clearHomeCache()).resolves.toBeUndefined();
    });
  });

  // A sign-out clears the copy. A load that began before it must not write one back, even
  // if it lands before Home has unmounted.
  describe('the clear epoch', () => {
    it('drops a write from a load that began before a clear', async () => {
      const began = homeCacheEpoch();
      await clearHomeCache();
      await writeHomeCache(snapshot(), began);
      expect(await AsyncStorage.getItem(HOME_CACHE_KEY)).toBeNull();
    });

    it('keeps a write from a load that began after it', async () => {
      await clearHomeCache();
      await writeHomeCache(snapshot(), homeCacheEpoch());
      expect(await readHomeCache()).toEqual(snapshot());
    });

    it('moves the moment a clear is called, before its removal has even finished', () => {
      const before = homeCacheEpoch();
      const clearing = clearHomeCache(); // deliberately not awaited
      expect(homeCacheEpoch()).toBe(before + 1);
      return clearing;
    });

    it('writes when no epoch is given', async () => {
      await writeHomeCache(snapshot());
      expect(await readHomeCache()).toEqual(snapshot());
    });
  });

  describe('invitations that lapsed while the copy sat on disk', () => {
    const NOW = Date.parse('2026-09-19T12:00:00.000Z');
    const invite = (id: string, expires_at?: string) => ({ ...snapshot().invitations[0], id, expires_at });
    const save = (...invitations: ReturnType<typeof invite>[]) => writeHomeCache(snapshot({ invitations }));
    const ids = async () => (await readHomeCache(NOW))?.invitations.map((i) => i.id);

    it('are dropped on read; the ones still open are kept', async () => {
      await save(
        invite('gone', '2026-09-19T11:59:59.000Z'),
        invite('now', '2026-09-19T12:00:00.000Z'), // expires exactly now: lapsed
        invite('open', '2026-09-19T12:00:01.000Z'),
      );
      expect(await ids()).toEqual(['open']);
    });

    it('keep an invitation whose expiry is missing or unreadable — only a certain lapse drops one', async () => {
      await save(invite('none'), invite('junk', 'not a date'));
      expect(await ids()).toEqual(['none', 'junk']);
    });

    it('leave the groups and the timestamp alone', async () => {
      await save(invite('gone', '2026-01-01T00:00:00.000Z'));
      const read = await readHomeCache(NOW);
      expect(read?.groups).toEqual(snapshot().groups);
      expect(read?.fetchedAt).toBe(snapshot().fetchedAt);
    });
  });
});
