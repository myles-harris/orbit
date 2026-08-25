import { ApiClient } from '@orbit/shared';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

let _onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  _onSessionExpired = handler;
}

let cachedAccessToken: string | null = null;

/** Synchronous read of the in-memory token. Null if it has not been loaded yet. */
export function peekAccessToken(): string | null {
  return cachedAccessToken;
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  cachedAccessToken = await SecureStore.getItemAsync('access_token');
  return cachedAccessToken;
}

/** The only place the access token is written. Keeps the keychain and cache in step. */
export async function setAccessToken(token: string): Promise<void> {
  cachedAccessToken = token;
  await SecureStore.setItemAsync('access_token', token);
}

export function clearAccessToken(): void {
  cachedAccessToken = null;
}

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
    await setAccessToken(data.access_token);
    if (data.refresh_token) {
      await SecureStore.setItemAsync('refresh_token', data.refresh_token);
    }
    return data.access_token;
  } catch {
    return null;
  }
}

export const createAuthenticatedApiClient = async () => {
  let cachedToken = await getAccessToken();

  const refreshWithCache = async (): Promise<string | null> => {
    const newToken = await refreshAccessToken();
    if (newToken) {
      cachedToken = newToken;
    } else {
      _onSessionExpired?.();
    }
    return newToken;
  };

  return new ApiClient(API_URL, () => cachedToken, undefined, refreshWithCache);
};

export { API_URL };
