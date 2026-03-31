import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'group_color_v1_';

export const CARD_PALETTES: { bg: string; text: string }[] = [
  { bg: '#c2bce0', text: '#1e1844' },  // soft iris
  { bg: '#b8d4c4', text: '#133324' },  // sage green
  { bg: '#d4b8b8', text: '#3a1a1a' },  // dusty rose
  { bg: '#b8c8d4', text: '#142030' },  // slate blue
  { bg: '#d4cdb0', text: '#32280c' },  // warm ochre
  { bg: '#c4d0bc', text: '#1a2c16' },  // muted olive
  { bg: '#d4b8cc', text: '#38142e' },  // mauve
  { bg: '#b8d0d0', text: '#0e2828' },  // teal mist
];

export const CARD_PALETTE_COUNT = CARD_PALETTES.length;

/** Deterministic default based on group name — used before user picks a color */
export function defaultPaletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return hash % CARD_PALETTE_COUNT;
}

/** Returns the saved index, or null if the user hasn't chosen one */
export async function getGroupColorIndex(groupId: string): Promise<number | null> {
  const val = await AsyncStorage.getItem(KEY_PREFIX + groupId);
  return val !== null ? parseInt(val, 10) : null;
}

/** Saves the user's chosen palette index for a group */
export async function setGroupColorIndex(groupId: string, index: number): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + groupId, String(index));
}

/** Batch-loads saved indices for multiple group IDs */
export async function getGroupColorIndices(groupIds: string[]): Promise<Record<string, number | null>> {
  if (groupIds.length === 0) return {};
  const pairs = await AsyncStorage.multiGet(groupIds.map(id => KEY_PREFIX + id));
  const result: Record<string, number | null> = {};
  for (const [key, value] of pairs) {
    const groupId = key.slice(KEY_PREFIX.length);
    result[groupId] = value !== null ? parseInt(value, 10) : null;
  }
  return result;
}
