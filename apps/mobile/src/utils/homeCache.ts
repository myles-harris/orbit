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
}

/** What the last successful load of Home returned, and when (epoch ms). */
export interface HomeSnapshot {
  groups: GroupDTO[];
  invitations: Invitation[];
  fetchedAt: number;
}

/**
 * Saves the last good load so Home can draw it when the next one cannot reach the
 * server. Never throws: a full or unavailable disk costs the offline copy, and must
 * not take down the load that produced it.
 */
export async function writeHomeCache(snapshot: HomeSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Non-fatal: the screen already has the data; only the next offline start loses it.
  }
}

/**
 * The saved copy, or null when there is none or it cannot be trusted. It came off
 * disk, so it is checked before it can reach a render: an entry that no longer
 * parses, or that lacks what a tile or row reads, is treated as no cache — Home then
 * shows its error state, which is honest — rather than crashing on `undefined.name`.
 */
export async function readHomeCache(): Promise<HomeSnapshot | null> {
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
    return { groups: parsed.groups, invitations: parsed.invitations, fetchedAt: parsed.fetchedAt };
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
  try {
    await AsyncStorage.removeItem(HOME_CACHE_KEY);
  } catch {
    // Non-fatal: worst case the next sign-in can see the previous account's copy while offline.
  }
}
