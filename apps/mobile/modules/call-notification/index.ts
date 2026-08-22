import { Platform } from 'react-native';

type CallNotificationModuleType = {
  postOngoingCall(
    groupName: string,
    callId: string,
    groupId: string,
    endsAtMs: number | null,
  ): void;
  cancelOngoingCall(): void;
};

const noop: CallNotificationModuleType = {
  postOngoingCall: () => {},
  cancelOngoingCall: () => {},
};

let CallNotification: CallNotificationModuleType = noop;

if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    const Native = requireNativeModule('CallNotification');
    CallNotification = {
      postOngoingCall: (groupName, callId, groupId, endsAtMs) =>
        Native.postOngoingCall(groupName, callId, groupId, endsAtMs),
      cancelOngoingCall: () => Native.cancelOngoingCall(),
    };
  } catch (e) {
    console.warn('[CallNotification] native module unavailable', e);
  }
}

export default CallNotification;
