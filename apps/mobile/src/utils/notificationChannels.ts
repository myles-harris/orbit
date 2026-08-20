import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface CallPrefs {
  sound: boolean;
  vibrate: boolean;
  breakFocus: boolean;
}

export const DEFAULT_CALL_PREFS: CallPrefs = { sound: true, vibrate: true, breakFocus: false };

const PREFS_CACHE_KEY = 'orbit.notifyPrefs';

const VIBRATION_PATTERN = [0, 400, 200, 400];

export function channelIdFor(p: CallPrefs): string {
  return [
    'calls',
    p.sound ? 'sound' : 'silent',
    p.vibrate ? 'vibrate' : 'novibrate',
    p.breakFocus ? 'dnd' : 'nodnd',
  ].join('-');
}

/**
 * Idempotent: creating an existing channel is a no-op, safe to call on every mount.
 * Returns the channel id so callers can pass it to pruneCallChannels.
 */
export async function ensureCallChannel(p: CallPrefs): Promise<string> {
  const id = channelIdFor(p);
  if (Platform.OS !== 'android') return id;
  await Notifications.setNotificationChannelAsync(id, {
    name: 'Incoming calls',
    importance: Notifications.AndroidImportance.MAX,
    // expo-notifications' SoundResolver strips the extension and looks the basename up in
    // res/raw, so this resolves to R.raw.orbit_ring either way — but the file on disk is
    // .wav and this string must not imply otherwise.
    sound: p.sound ? 'orbit_ring.wav' : null,
    vibrationPattern: p.vibrate ? VIBRATION_PATTERN : [0],
    enableVibrate: p.vibrate,
    bypassDnd: p.breakFocus,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  return id;
}

/**
 * Deletes all `calls-*` channels except the one currently in use.
 * Android remembers deleted channels by id, so we version by encoding prefs in the id.
 * Keeping only the active channel prevents the system settings screen from showing stale entries.
 */
export async function pruneCallChannels(keepId: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const all = await Notifications.getNotificationChannelsAsync();
  await Promise.all(
    all
      .filter((c) => c.id.startsWith('calls-') && c.id !== keepId)
      .map((c) => Notifications.deleteNotificationChannelAsync(c.id)),
  );
}

/**
 * Last prefs we successfully synced a channel for, or null if we've never synced.
 * Isolated try/catch: a storage failure must degrade to defaults, never propagate.
 */
export async function readCachedCallPrefs(): Promise<CallPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.sound !== 'boolean' || typeof p?.vibrate !== 'boolean' || typeof p?.breakFocus !== 'boolean') {
      return null;
    }
    return { sound: p.sound, vibrate: p.vibrate, breakFocus: p.breakFocus };
  } catch {
    return null;
  }
}

/**
 * Drops the cached call prefs. Call on logout — otherwise the next user to sign in
 * on this device (or this install, before /me responds) briefly inherits whichever
 * prefs the previous account last synced, including a DND-bypass channel.
 */
export async function clearCachedCallPrefs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFS_CACHE_KEY);
  } catch {
    // Non-fatal: worst case the next sign-in briefly reuses the previous account's prefs.
  }
}

// Callers can legitimately overlap — App.tsx auto-syncs on auth/foreground while
// SettingsScreen syncs on a manual toggle. pruneCallChannels deletes every calls-*
// channel except the one it just created, so two interleaved runs can each delete
// the channel the other just made (or race the AsyncStorage cache write out of
// order). Chain every call onto whichever is already in flight so they run one at
// a time, in call order, regardless of caller.
let syncQueue: Promise<string | undefined> = Promise.resolve(undefined);

/**
 * Ensures the channel for `p` exists, removes every other `calls-*` channel, and
 * caches `p` as the local source of truth for the next cold start.
 * Android-only; resolves to undefined on iOS. Serialized across all callers — see
 * `syncQueue` above.
 */
export function syncCallChannel(p: CallPrefs): Promise<string | undefined> {
  const run = async () => {
    if (Platform.OS !== 'android') return undefined;
    const id = await ensureCallChannel(p);
    await pruneCallChannels(id);
    try {
      await AsyncStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(p));
    } catch {
      // Non-fatal: the channel is correct now; only the next cold start degrades.
    }
    return id;
  };
  const next = syncQueue.then(run, run);
  syncQueue = next;
  return next;
}
