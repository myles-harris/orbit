import { ApiClient } from '@orbit/shared';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    if (!refreshToken) return null;

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    await SecureStore.setItemAsync('access_token', data.access_token);
    if (data.refresh_token) {
      await SecureStore.setItemAsync('refresh_token', data.refresh_token);
    }
    return data.access_token;
  } catch {
    return null;
  }
}

export const createApiClient = () => {
  return new ApiClient(API_URL, () => null);
};

export const createAuthenticatedApiClient = async () => {
  // For synchronous getToken callback, we use a mutable reference
  // that gets updated after successful token refresh
  let cachedToken = await SecureStore.getItemAsync('access_token');

  const refreshWithCache = async (): Promise<string | null> => {
    const newToken = await refreshAccessToken();
    if (newToken) {
      cachedToken = newToken; // Update cache so next getToken() returns new token
    }
    return newToken;
  };

  return new ApiClient(API_URL, () => cachedToken, undefined, refreshWithCache);
};

export { API_URL };
