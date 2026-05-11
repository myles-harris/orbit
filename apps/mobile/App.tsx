import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { CallLiveActivity } from './modules/CallLiveActivity';
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
import { TutorialProvider } from './src/context/TutorialContext';
import TutorialModal from './src/components/TutorialModal';
import { navigationRef } from './src/navigation/navigationRef';

import { API_URL } from './src/config';

// Configure notification handler — suppress alert UI for silent call_ended pushes
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isSilent = notification.request.content.data?.type === 'call_ended';
    return {
      shouldShowAlert: !isSilent,
      shouldShowBanner: !isSilent,
      shouldShowList: !isSilent,
      shouldPlaySound: !isSilent,
      shouldSetBadge: false,
    };
  },
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const appState = useRef(AppState.currentState);

  // Track active call presence state
  const liveActivityIdRef = useRef<string | null>(null);
  const ongoingNotifIdRef = useRef<string | null>(null);

  // ─── Android notification channel ──────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('call-ongoing', {
        name: 'Active Calls',
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
        enableVibrate: false,
      });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setupPushNotifications();
    }
  }, [isAuthenticated]);

  // Re-run push setup when app comes back to foreground — catches the case where
  // the user denied permissions, went to Settings to grant them, then returned.
  useEffect(() => {
    if (!isAuthenticated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        setupPushNotifications();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated]);

  // ─── Call presence helpers ──────────────────────────────────────────────────

  const startCallPresence = useCallback(async (
    callId: string,
    groupId: string,
    groupName: string,
    callType: 'spontaneous' | 'scheduled',
    endsAt?: string,
  ) => {
    // Android: post a non-dismissable local ongoing notification
    if (Platform.OS === 'android') {
      // Dismiss any previous ongoing notification first
      if (ongoingNotifIdRef.current) {
        await Notifications.dismissNotificationAsync(ongoingNotifIdRef.current).catch(() => {});
        ongoingNotifIdRef.current = null;
      }
      const endsAtDate = endsAt ? new Date(endsAt) : null;
      const bodyText = endsAtDate
        ? `Active Call • Ends ${endsAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Active Call • Tap to join';
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `${groupName} is calling!`,
            body: bodyText,
            data: { callId, groupId, type: 'call_started' },
            sticky: true,
            autoDismiss: false,
            // channelId is valid at runtime but missing from this SDK's TS types
            ...({ channelId: 'call-ongoing' } as any),
          },
          trigger: null,
        });
        ongoingNotifIdRef.current = id;
      } catch (e) {
        console.error('[presence] Failed to post ongoing notification:', e);
      }
    }

    // iOS: start a Live Activity (requires native module + Xcode setup)
    if (Platform.OS === 'ios' && CallLiveActivity) {
      // End any previous Live Activity first
      if (liveActivityIdRef.current) {
        await CallLiveActivity.endActivityAsync(liveActivityIdRef.current).catch(() => {});
        liveActivityIdRef.current = null;
      }
      try {
        const activityId = await CallLiveActivity.startActivityAsync(callId, groupId, {
          groupName,
          callType,
          endsAt: endsAt ? new Date(endsAt).getTime() : undefined,
        });
        if (activityId) liveActivityIdRef.current = activityId;
      } catch (e) {
        console.error('[presence] Failed to start Live Activity:', e);
      }
    }
  }, []);

  const endCallPresence = useCallback(async () => {
    if (Platform.OS === 'android' && ongoingNotifIdRef.current) {
      await Notifications.dismissNotificationAsync(ongoingNotifIdRef.current).catch(() => {});
      ongoingNotifIdRef.current = null;
    }

    if (Platform.OS === 'ios' && liveActivityIdRef.current && CallLiveActivity) {
      await CallLiveActivity.endActivityAsync(liveActivityIdRef.current).catch(() => {});
      liveActivityIdRef.current = null;
    }
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

  // Handle cold-start tap: app was killed, user tapped a call notification to open it
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data;
      if (data?.type === 'call_started' && data.groupId) {
        startCallPresence(
          data.callId as string,
          data.groupId as string,
          data.groupName as string,
          (data.callType as 'spontaneous' | 'scheduled') ?? 'spontaneous',
          data.endsAt as string | undefined,
        );
        if (navigationRef.isReady()) {
          navigationRef.navigate('GroupDetail', { groupId: data.groupId as string });
        }
      }
    });
  }, [startCallPresence]);

  // Listen for foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      console.log('Notification received in foreground:', notification);
      const data = notification.request.content.data;
      if (data?.type === 'call_started') {
        await startCallPresence(
          data.callId as string,
          data.groupId as string,
          data.groupName as string,
          (data.callType as 'spontaneous' | 'scheduled') ?? 'spontaneous',
          data.endsAt as string | undefined,
        );
      } else if (data?.type === 'call_ended') {
        await endCallPresence();
      }
    });

    return () => subscription.remove();
  }, [startCallPresence, endCallPresence]);

  // Listen for notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      console.log('Notification tapped:', response);
      const data = response.notification.request.content.data;

      if (data.type === 'call_started' && data.groupId) {
        // Start presence tracking so the Live Activity / ongoing notification appears
        await startCallPresence(
          data.callId as string,
          data.groupId as string,
          data.groupName as string,
          (data.callType as 'spontaneous' | 'scheduled') ?? 'spontaneous',
          data.endsAt as string | undefined,
        );
        if (navigationRef.isReady()) {
          navigationRef.navigate('GroupDetail', { groupId: data.groupId as string });
        }
      }
    });

    return () => subscription.remove();
  }, [startCallPresence]);

  const { mode } = useTheme();

  if (isLoading) {
    return null; // Or a splash screen
  }

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator isAuthenticated={isAuthenticated} />
      <TutorialModal />
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
          <TutorialProvider>
            <AppContent />
          </TutorialProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
