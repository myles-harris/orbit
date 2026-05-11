import { Platform } from 'react-native';

type PipModuleType = {
  enterPipMode(): void;
  isSupported(): boolean;
};

let PipModule: PipModuleType;

if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireNativeModule } = require('expo-modules-core');
  const Native = requireNativeModule('Pip');
  PipModule = {
    enterPipMode: () => Native.enterPipMode(),
    isSupported: () => Native.isSupported?.() ?? false,
  };
} else {
  PipModule = {
    enterPipMode: () => {},
    isSupported: () => false,
  };
}

export default PipModule;
