import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { radius } from '../theme';

interface Props {
  userId: string;
  username: string;
  hasAvatar: boolean;
  size: number;
  colors: any;
  isOwner?: boolean;
  /** Increment to bust the image cache after an upload */
  cacheKey?: number;
}

export function UserAvatar({ userId, username, hasAvatar, size, colors, isOwner = false, cacheKey = 0 }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const borderRadius = size >= 60 ? radius.xl : radius.md;
  const bgColor = isOwner ? colors.primary : colors.primaryLight;
  const textColor = isOwner ? '#fff' : colors.primary;
  const fontSize = Math.round(size * 0.4);

  useEffect(() => {
    if (hasAvatar) {
      SecureStore.getItemAsync('access_token').then(setToken);
    }
  }, [hasAvatar]);

  if (hasAvatar && token) {
    const uri = `${API_URL}/users/${userId}/avatar${cacheKey ? `?v=${cacheKey}` : ''}`;
    return (
      <Image
        source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  const initial = username.trim().charAt(0).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize, fontWeight: '700', color: textColor }}>{initial}</Text>
    </View>
  );
}
