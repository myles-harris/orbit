import { Platform } from 'react-native';

type CallNotificationModuleType = {
  postOngoingCall(groupName: string, callId: string, groupId: string, endsAtMs: number | null): void;
  cancelOngoingCall(): void;
};

let CallNotification: CallNotificationModuleType | null = null;

if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireNativeModule } = require('expo-modules-core');
  const Native = requireNativeModule('CallNotification');
  CallNotification = {
    postOngoingCall: (groupName, callId, groupId, endsAtMs) =>
      Native.postOngoingCall(groupName, callId, groupId, endsAtMs),
    cancelOngoingCall: () => Native.cancelOngoingCall(),
  };
}

export default CallNotification;
