import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { CallLiveActivity, addPushToStartTokenListener } from './modules/call-live-activity';
import CallNotification from './modules/call-notification';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
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
import type { UserDTO } from '@orbit/shared';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { createAuthenticatedApiClient } from './src/utils/apiClient';
import { DEFAULT_CALL_PREFS, readCachedCallPrefs, syncCallChannel } from './src/utils/notificationChannels';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { TutorialProvider } from './src/context/TutorialContext';
import TutorialModal from './src/components/TutorialModal';
import { navigationRef } from './src/navigation/navigationRef';

import { API_URL } from './src/config';

// Configure notification handler for call notifications.
// - Fires haptics for call_started when vibrate flag is set (iOS foreground only;
//   on iOS the haptic IS the vibration since remote notifications can't control it).
// - Reads sound/vibrate from the data payload set by the server's sendToBuckets.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, string> | undefined;
    const playSound = data?.sound !== 'false';

    if (data?.vibrate === 'true' && Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: playSound,
      shouldSetBadge: false,
    };
  },
});

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const appState = useRef(AppState.currentState);

  // Track active call presence state
  const liveActivityIdRef = useRef<string | null>(null);

  // Android: ensure the ongoing call notification channel exists (used by CallNotificationHelper).
  // Must match CallNotificationHelper.ensureChannel — Android locks sound/importance at
  // creation, so if these two definitions ever diverge AND the Kotlin path can run first,
  // the divergence becomes permanent for that install.
  // The notification preference-specific channels are synced from syncCallChannelFromServer.
  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('call-ongoing', {
        name: 'Active Calls',
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
        enableVibrate: false,
      });
      Notifications.setNotificationChannelAsync('invites', {
        name: 'Invitations',
        importance: Notifications.AndroidImportance.DEFAULT,
        // Default system sound, no DND bypass, no call tone — an invite is not a call.
      });
    }
  }, []);

  // Android: the calls-* channel is what carries the tone, MAX importance and DND bypass.
  // Without it expo-notifications falls back to its own default-sound channel, so both the
  // tone and the user's mute preference are lost. Sync from cached prefs first so an
  // offline launch still lands on the right channel, then reconcile with the server.
  // syncCallChannel serializes concurrent callers internally (this fires from two different
  // effects below plus SettingsScreen's manual toggles), so overlapping invocations here are
  // safe — they queue rather than racing each other's channel create/delete.
  const syncCallChannelFromServer = useCallback(async () => {
    if (Platform.OS !== 'android') return;

    const cached = await readCachedCallPrefs();
    try {
      await syncCallChannel(cached ?? DEFAULT_CALL_PREFS);
    } catch (e) {
      console.warn('[channels] cached sync failed:', e);
    }

    try {
      const client = await createAuthenticatedApiClient();
      const me = await client.get<UserDTO>('/me');
      await syncCallChannel({
        sound: me.notify_sound,
        vibrate: me.notify_vibrate,
        breakFocus: me.notify_break_focus,
      });
    } catch (e) {
      // Cached channel stays in place; retried on next launch/foreground.
      console.warn('[channels] pref sync failed:', e);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setupPushNotifications();
      syncCallChannelFromServer();
    }
  }, [isAuthenticated]);

  // WS-3: after sign-in, honour a pending invite link the user tapped while signed out
  useEffect(() => {
    if (!isAuthenticated) return;
    const takePendingInvite = async () => {
      try {
        const code = await AsyncStorage.getItem('orbit.pendingInviteCode');
        if (!code) return;
        if (!navigationRef.isReady()) return; // retry on next auth-state change
        navigationRef.navigate('JoinInvite', { code });
        await AsyncStorage.removeItem('orbit.pendingInviteCode');
      } catch {
        // non-fatal
      }
    };
    takePendingInvite();
  }, [isAuthenticated]);

  // WS-5e: seed the user's timezone from the device once per install
  useEffect(() => {
    if (!isAuthenticated) return;
    const seedTimezone = async () => {
      try {
        const alreadySeeded = await AsyncStorage.getItem('orbit.tzSeeded');
        if (alreadySeeded) return;
        const deviceTz = Localization.getCalendars()[0]?.timeZone;
        if (!deviceTz) return;
        const accessToken = await SecureStore.getItemAsync('access_token');
        if (!accessToken) return;
        const client = new ApiClient(API_URL, () => accessToken);
        await client.patch('/me', { time_zone: deviceTz });
        await AsyncStorage.setItem('orbit.tzSeeded', '1');
      } catch {
        // non-fatal — will retry on next launch until it succeeds
      }
    };
    seedTimezone();
  }, [isAuthenticated]);

  // Sweep any stale Live Activities left over from a previous session/crash
  useEffect(() => {
    if (isAuthenticated && Platform.OS === 'ios' && CallLiveActivity) {
      CallLiveActivity.endAllActivitiesAsync().catch(() => {});
    }
  }, [isAuthenticated]);

  // Register the push-to-start token (iOS 17.2+) so the server can start a Live Activity
  // on a locked or force-quit device without the app running first.
  useEffect(() => {
    if (!isAuthenticated || Platform.OS !== 'ios' || !CallLiveActivity) return;

    const registerPtsToken = async (token: string) => {
      try {
        const deviceToken = await SecureStore.getItemAsync('push_token');
        if (!deviceToken) return;
        const accessToken = await SecureStore.getItemAsync('access_token');
        if (!accessToken) return;
        const client = new ApiClient(API_URL, () => accessToken);
        await client.post('/me/devices/register-live-activity', {
          device_token: deviceToken,
          pts_token: token,
        });
      } catch { /* best-effort */ }
    };

    // Pull in case a token was issued before JS subscribed (cold-start race).
    CallLiveActivity.getPushToStartTokenAsync().then((token) => {
      if (token) registerPtsToken(token);
    }).catch(() => {});

    // Subscribe to future rotations.
    const sub = addPushToStartTokenListener(({ token }) => registerPtsToken(token));
    return () => sub.remove();
  }, [isAuthenticated]);

  // Re-run push setup when app comes back to foreground — catches the case where
  // the user denied permissions, went to Settings to grant them, then returned.
  useEffect(() => {
    if (!isAuthenticated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        setupPushNotifications();
        syncCallChannelFromServer();
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
    // Android: post a non-dismissable local ongoing notification with live chronometer
    if (Platform.OS === 'android' && CallNotification) {
      CallNotification.postOngoingCall(
        groupName, callId, groupId,
        endsAt ? new Date(endsAt).getTime() : null,
      );
    }

    // iOS: start a Live Activity (requires native module + Xcode setup).
    // Skip if push-to-start already started one for this callId so we don't create a duplicate.
    if (Platform.OS === 'ios' && CallLiveActivity) {
      const alreadyStarted = await CallLiveActivity.hasActivityForCall(callId).catch(() => false);
      if (alreadyStarted) return;

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
      }
    });

    return () => subscription.remove();
  }, [startCallPresence]);

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
