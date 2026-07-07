import { Platform } from 'react-native';

export interface CallActivityState {
  groupName: string;
  callType: 'spontaneous' | 'scheduled';
  /** Epoch milliseconds. Only set for scheduled calls. */
  endsAt?: number;
}

type CallLiveActivityModuleType = {
  startActivityAsync(callId: string, groupId: string, state: CallActivityState): Promise<string | null>;
  endActivityAsync(activityId: string): Promise<void>;
  endAllActivitiesAsync(): Promise<void>;
};

let CallLiveActivity: CallLiveActivityModuleType | null = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    const Native = requireNativeModule('CallLiveActivity');
    CallLiveActivity = {
      startActivityAsync: (callId, groupId, state) =>
        Native.startActivityAsync(callId, groupId, state),
      endActivityAsync: (activityId) => Native.endActivityAsync(activityId),
      endAllActivitiesAsync: () => Native.endAllActivitiesAsync(),
    };
  } catch {
    // Native module not available: simulator, iOS < 16.2, or not yet built
  }
}

export { CallLiveActivity };
