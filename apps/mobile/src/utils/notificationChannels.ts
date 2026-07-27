import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface CallPrefs {
  sound: boolean;
  vibrate: boolean;
  breakFocus: boolean;
}

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
    sound: p.sound ? 'orbit_ring.mp3' : null,
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
