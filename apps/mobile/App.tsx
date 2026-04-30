import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Asset } from 'expo-asset';
import {
  useFonts,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import {
  RobotoMono_400Regular,
  RobotoMono_500Medium,
  RobotoMono_700Bold,
} from '@expo-google-fonts/roboto-mono';
import { Chango_400Regular } from '@expo-google-fonts/chango';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiClient } from '@orbit/shared';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { navigationRef } from './src/navigation/navigationRef';

import { API_URL } from './src/config';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      setupPushNotifications();
    }
  }, [isAuthenticated]);

  const setupPushNotifications = async () => {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return;
    }

    // Get token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '8bfe8018-2ae5-4dbb-b0d4-a9a3ed5ffe6a',
    });
    const pushToken = tokenData.data;

    console.log('Push token:', pushToken);

    // Register with backend
    try {
      const accessToken = await SecureStore.getItemAsync('access_token');
      if (accessToken) {
        const client = new ApiClient(API_URL, () => accessToken);
        await client.post('/me/devices/register-push', {
          token: pushToken,
          platform: Platform.OS as 'ios' | 'android',
        });
        await SecureStore.setItemAsync('push_token', pushToken);
        console.log('Push token registered with backend');
      }
    } catch (error) {
      console.error('Failed to register push token:', error);
    }
  };

  // Listen for foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received in foreground:', notification);
    });

    return () => subscription.remove();
  }, []);

  // Listen for notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      const data = response.notification.request.content.data;

      if (data.type === 'call_started' && data.groupId) {
        if (navigationRef.isReady()) {
          navigationRef.navigate('GroupDetail', { groupId: data.groupId as string });
        }
      }
    });

    return () => subscription.remove();
  }, []);

  const { mode } = useTheme();

  if (isLoading) {
    return null; // Or a splash screen
  }

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator isAuthenticated={isAuthenticated} />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    RobotoMono_400Regular,
    RobotoMono_500Medium,
    RobotoMono_700Bold,
    Chango_400Regular,
  });

  const [assetsLoaded, setAssetsLoaded] = useState(false);
  useEffect(() => {
    Asset.loadAsync([require('./assets/background-gradient-4.jpeg')])
      .then(() => setAssetsLoaded(true))
      .catch(() => setAssetsLoaded(true)); // don't block on failure
  }, []);

  if (!fontsLoaded || !assetsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
