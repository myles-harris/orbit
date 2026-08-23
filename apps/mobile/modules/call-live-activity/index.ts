import { Platform } from 'react-native';

export interface CallActivityState {
  groupName: string;
  callType: 'spontaneous' | 'scheduled';
  /** Epoch milliseconds. Only set for scheduled calls. */
  endsAt?: number;
  participantCount?: number;
}

type CallLiveActivityModuleType = {
  startActivityAsync(callId: string, groupId: string, state: CallActivityState): Promise<string | null>;
  endActivityAsync(activityId: string): Promise<void>;
  endAllActivitiesAsync(): Promise<void>;
  getPushToStartTokenAsync(): Promise<string | null>;
  activityIdForCall(callId: string): Promise<string | null>;
  endActivitiesExceptAsync(callIds: string[]): Promise<void>;
};

let CallLiveActivity: CallLiveActivityModuleType | null = null;
// NativeRaw is the module returned by requireNativeModule — it is an EventEmitter on SDK 54.
let NativeRaw: any = null;

if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    NativeRaw = requireNativeModule('CallLiveActivity');
    CallLiveActivity = {
      startActivityAsync: (callId, groupId, state) =>
        NativeRaw.startActivityAsync(callId, groupId, state),
      endActivityAsync: (activityId) => NativeRaw.endActivityAsync(activityId),
      endAllActivitiesAsync: () => NativeRaw.endAllActivitiesAsync(),
      getPushToStartTokenAsync: () => NativeRaw.getPushToStartTokenAsync(),
      activityIdForCall: (callId) => NativeRaw.activityIdForCall(callId),
      endActivitiesExceptAsync: (callIds) => NativeRaw.endActivitiesExceptAsync(callIds),
    };
  } catch {
    // Native module not available: simulator, or not yet built
  }
}

/** Subscribe to push-to-start token updates. Upload each token to /me/devices/register-live-activity. */
export function addPushToStartTokenListener(cb: (e: { token: string }) => void): { remove(): void } {
  if (Platform.OS !== 'ios' || !NativeRaw) return { remove() {} };
  return NativeRaw.addListener('onPushToStartToken', cb);
}

/** Subscribe to per-activity push token updates. Used to send remote end/update pushes. */
export function addActivityPushTokenListener(
  cb: (e: { activityId: string; callId: string; token: string }) => void,
): { remove(): void } {
  if (Platform.OS !== 'ios' || !NativeRaw) return { remove() {} };
  return NativeRaw.addListener('onActivityPushToken', cb);
}

export { CallLiveActivity };
