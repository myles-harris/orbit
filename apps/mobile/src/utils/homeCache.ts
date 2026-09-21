import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroupDTO } from '@orbit/shared';

export const HOME_CACHE_KEY = 'orbit.cache.groups';

/** A pending invitation, as Home draws it. */
export interface Invitation {
  id: string;
  group: {
    id: string;
    name: string;
    cadence: string;
    weekly_frequency: number | null;
    call_duration_minutes: number;
    member_count: number;
  };
  invited_by: string;
  /** ISO time the invitation lapses, as the server sends it. */
  expires_at?: string;
}

/** What the last successful load of Home returned, and when (epoch ms). */
export interface HomeSnapshot {
  groups: GroupDTO[];
  invitations: Invitation[];
  fetchedAt: number;
}

// Bumped by every clear. A load notes the epoch it began in and its write is dropped if
// a clear happened since — otherwise a load that resolves between "the account signed
// out" and "Home unmounted" would put the old account's copy straight back.
let epoch = 0;

/** The epoch to hand `writeHomeCache` from a load that begins now. */
export const homeCacheEpoch = (): number => epoch;

/**
 * Saves the last good load so Home can draw it when the next one cannot reach the
 * server. Never throws: a full or unavailable disk costs the offline copy, and must
 * not take down the load that produced it.
 *
 * `loadEpoch` is `homeCacheEpoch()` as it stood when the load began. If the cache was
 * cleared since, the write is dropped.
 */
export async function writeHomeCache(snapshot: HomeSnapshot, loadEpoch: number = epoch): Promise<void> {
  if (loadEpoch !== epoch) return;
  try {
    await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Non-fatal: the screen already has the data; only the next offline start loses it.
  }
}

/** Lapsed only when the server's time parses and has passed; anything else is kept. */
const isExpired = (invitation: Invitation, now: number): boolean => {
  if (!invitation.expires_at) return false;
  const at = Date.parse(invitation.expires_at);
  return Number.isFinite(at) && at <= now;
};

/**
 * The saved copy, or null when there is none or it cannot be trusted. It came off
 * disk, so it is checked before it can reach a render: an entry that no longer
 * parses, or that lacks what a tile or row reads, is treated as no cache — Home then
 * shows its error state, which is honest — rather than crashing on `undefined.name`.
 *
 * Invitations that have lapsed since the copy was saved are dropped: offline there is
 * no server to tell Home so, and a days-old copy would otherwise offer an Accept that
 * can only fail.
 */
export async function readHomeCache(now: number = Date.now()): Promise<HomeSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.groups) || !Array.isArray(parsed?.invitations)) return null;
    if (typeof parsed.fetchedAt !== 'number' || !Number.isFinite(parsed.fetchedAt)) return null;
    const groupsOk = parsed.groups.every((g: any) => typeof g?.id === 'string' && typeof g?.name === 'string');
    const invitationsOk = parsed.invitations.every(
      (i: any) => typeof i?.id === 'string' && typeof i?.group?.name === 'string',
    );
    if (!groupsOk || !invitationsOk) return null;
    return {
      groups: parsed.groups,
      invitations: parsed.invitations.filter((i: Invitation) => !isExpired(i, now)),
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Drops the saved copy. Call on logout — the key is not per-user, so otherwise the
 * next account to sign in on this device would see the previous one's group names
 * whenever it started offline.
 */
export async function clearHomeCache(): Promise<void> {
  epoch += 1; // synchronously, before the removal is even queued
  try {
    await AsyncStorage.removeItem(HOME_CACHE_KEY);
  } catch {
    // Non-fatal: worst case the next sign-in can see the previous account's copy while offline.
  }
}
