import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { API_URL, getAccessToken, peekAccessToken } from '../utils/apiClient';
import { radius } from '../theme';

interface Props {
  userId: string;
  username: string;
  hasAvatar: boolean;
  size: number;
  colors: any;
  isOwner?: boolean;
  /** ISO timestamp from the API. Versions the URL so it can be cached indefinitely. */
  avatarUpdatedAt?: string | null;
  /** Local file URI shown instead of the remote avatar (optimistic preview after upload). */
  previewUri?: string | null;
}

export function UserAvatar({
  userId, username, hasAvatar, size, colors,
  isOwner = false, avatarUpdatedAt = null, previewUri = null,
}: Props) {
  // Seeded synchronously from the in-memory cache so rows render the photo on the
  // first paint instead of flashing initials while the keychain read resolves.
  const [token, setToken] = useState<string | null>(() => peekAccessToken());
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const borderRadius = size >= 60 ? radius.xl : radius.md;
  const bgColor = isOwner ? colors.primary : colors.primaryLight;
  const textColor = isOwner ? '#fff' : colors.primary;
  const fontSize = Math.round(size * 0.4);
  const dimensions = { width: size, height: size, borderRadius };

  useEffect(() => {
    if (token || !hasAvatar) return;
    let active = true;
    getAccessToken().then(t => { if (active) setToken(t); });
    return () => { active = false; };
  }, [hasAvatar, token]);

  useEffect(() => { setLoadFailed(false); setAttempt(0); }, [userId, avatarUpdatedAt]);

  if (previewUri) {
    return <Image source={{ uri: previewUri }} style={dimensions} resizeMode="cover" />;
  }

  if (hasAvatar && token && !loadFailed) {
    const version = avatarUpdatedAt ? new Date(avatarUpdatedAt).getTime() : null;
    const uri = `${API_URL}/users/${userId}/avatar${version ? `?v=${version}` : ''}`;
    return (
      <Image
        key={`avatar-${attempt}`}
        source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
        style={dimensions}
        resizeMode="cover"
        // The token captured at mount is valid for 15 minutes. A screen left open
        // longer can 401 on a fresh fetch — retry once with a freshly read token
        // before falling back to initials, since a refresh may have landed in the
        // in-memory cache in the meantime without this component knowing.
        onError={async () => {
          if (attempt > 0) { setLoadFailed(true); return; }
          // Don't bump `attempt` (which remounts the Image via `key`) until the fresh
          // token is in hand — bumping it first would remount immediately with the
          // still-stale `token` state, fail again, and arm loadFailed before the
          // fetched token could ever be applied.
          const fresh = await getAccessToken();
          if (fresh && fresh !== token) {
            setAttempt(1);
            setToken(fresh);
          } else {
            setLoadFailed(true);
          }
        }}
      />
    );
  }

  const initial = username.trim().charAt(0).toUpperCase();
  return (
    <View style={{ ...dimensions, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize, fontWeight: '700', color: textColor }}>{initial}</Text>
    </View>
  );
}
