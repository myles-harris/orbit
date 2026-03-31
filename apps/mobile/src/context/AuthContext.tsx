import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setSessionExpiredHandler, API_URL } from '../utils/apiClient';
import { ApiClient } from '@orbit/shared';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const sessionExpiredShown = useRef(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Failed to check auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const onLogin = () => {
    sessionExpiredShown.current = false;
    setIsAuthenticated(true);
  };

  const onLogout = async () => {
    try {
      const [accessToken, pushToken] = await Promise.all([
        SecureStore.getItemAsync('access_token'),
        SecureStore.getItemAsync('push_token'),
      ]);
      if (accessToken && pushToken) {
        const client = new ApiClient(API_URL, () => accessToken);
        await client.delete(`/me/devices/register-push?token=${encodeURIComponent(pushToken)}`);
      }
    } catch (error) {
      console.error('Failed to deregister push token:', error);
    }
    await Promise.all([
      SecureStore.deleteItemAsync('access_token').catch(() => {}),
      SecureStore.deleteItemAsync('refresh_token').catch(() => {}),
      SecureStore.deleteItemAsync('push_token').catch(() => {}),
    ]);
    setIsAuthenticated(false);
  };

  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (sessionExpiredShown.current) return;
      sessionExpiredShown.current = true;
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please log in again.',
        [{ text: 'OK', onPress: onLogout }]
      );
    });
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, onLogin, onLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
