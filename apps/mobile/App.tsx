import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import AppNavigator from './src/navigation/AppNavigator';
import { ApiClient } from '@orbit/shared';
import { AuthProvider, useAuth } from './src/context/AuthContext';

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
    setupPushNotifications();
  }, []);

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
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    console.log('Push token:', pushToken);

    // Register with backend
    try {
      const accessToken = await SecureStore.getItemAsync('access_token');
      if (accessToken) {
        const client = new ApiClient(API_URL, () => accessToken);
        await client.post('/devices/register-push', {
          token: pushToken,
          platform: 'ios', // or 'android' based on Platform.OS
        });
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

      if (data.type === 'call_started') {
        // TODO: Navigate to call screen or group detail
        console.log('Call started notification:', data);
      }
    });

    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return null; // Or a splash screen
  }

  return (
    <>
      <StatusBar style="auto" />
      <AppNavigator isAuthenticated={isAuthenticated} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
