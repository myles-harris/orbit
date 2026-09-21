import { useEffect, useState } from 'react';
import { API_URL, getAccessToken, peekAccessToken } from './apiClient';

interface GroupPhotoArgs {
  groupId: string;
  /** `GroupDTO.has_photo`. */
  hasPhoto: boolean;
  /** ISO timestamp from the API. Versions the URL so it can be cached indefinitely. */
  photoUpdatedAt?: string | null;
}

export interface GroupPhotoImage {
  /** Pass as the Image's `key`: bumping it remounts the Image for the one 401 retry. */
  imageKey: string;
  source: { uri: string; headers: { Authorization: string } };
  onError: () => void;
}

/**
 * What an `<Image>` needs to show a group's photo, or `null` when there is none to
 * show — the group has none, the token is not in hand yet, or the load failed twice.
 * Callers treat `null` as "draw the no-photo state", which is the designed fallback.
 *
 * The same state machine as `UserAvatar`: React Native's own `Image`, which does not go
 * through `apiClient`, so the token and its one retry live here.
 */
export function useGroupPhoto({ groupId, hasPhoto, photoUpdatedAt = null }: GroupPhotoArgs): GroupPhotoImage | null {
  // Seeded synchronously from the in-memory cache so a tile paints its photo on the
  // first frame instead of flashing the no-photo state while the keychain read resolves.
  const [token, setToken] = useState<string | null>(() => peekAccessToken());
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token || !hasPhoto) return;
    let active = true;
    getAccessToken().then(t => { if (active) setToken(t); });
    return () => { active = false; };
  }, [hasPhoto, token]);

  useEffect(() => { setLoadFailed(false); setAttempt(0); }, [groupId, photoUpdatedAt]);

  if (!hasPhoto || !token || loadFailed) return null;

  const version = photoUpdatedAt ? new Date(photoUpdatedAt).getTime() : null;
  const uri = `${API_URL}/groups/${groupId}/photo${version ? `?v=${version}` : ''}`;

  return {
    imageKey: `group-photo-${attempt}`,
    source: { uri, headers: { Authorization: `Bearer ${token}` } },
    // The token captured at mount is valid for 15 minutes. A screen left open longer
    // can 401 on a fresh fetch — retry once with a freshly read token before falling
    // back, since a refresh may have landed in the in-memory cache in the meantime
    // without this hook knowing.
    onError: async () => {
      if (attempt > 0) { setLoadFailed(true); return; }
      // Don't bump `attempt` (which remounts the Image via its key) until the fresh
      // token is in hand — bumping it first would remount immediately with the
      // still-stale `token` state, fail again, and arm loadFailed before the fetched
      // token could ever be applied.
      const fresh = await getAccessToken();
      if (fresh && fresh !== token) {
        setAttempt(1);
        setToken(fresh);
      } else {
        setLoadFailed(true);
      }
    },
  };
}
