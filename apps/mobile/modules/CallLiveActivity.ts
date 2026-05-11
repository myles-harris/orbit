import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export interface CallActivityState {
  groupName: string;
  callType: 'spontaneous' | 'scheduled';
  /** Unix timestamp in milliseconds. Only needed for scheduled calls. */
  endsAt?: number;
}

interface CallLiveActivityModule {
  startActivityAsync(callId: string, groupId: string, state: CallActivityState): Promise<string | null>;
  endActivityAsync(activityId: string): Promise<void>;
}

// Only available on iOS 16.1+ with the native module compiled into the app.
// Returns null on Android or when the module is not yet built.
function getLiveActivityModule(): CallLiveActivityModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule<CallLiveActivityModule>('CallLiveActivity');
  } catch {
    return null;
  }
}

export const CallLiveActivity = getLiveActivityModule();
