import { Platform } from 'react-native';

type PipModuleType = {
  enterPipMode(): void;
  isSupported(): boolean;
};

const noop: PipModuleType = {
  enterPipMode: () => {},
  isSupported: () => false,
};

let PipModule: PipModuleType = noop;

if (Platform.OS === 'android') {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    const Native = requireNativeModule('Pip');
    PipModule = {
      enterPipMode: () => Native.enterPipMode(),
      isSupported: () => Native.isSupported?.() ?? false,
    };
  } catch (e) {
    // modules/pip has no android/build.gradle, so expo-modules-autolinking skips it
    // and this throws at import, taking CallScreen's import chain down with it.
    // Degrade to no-op until the deferred Android work lands. The warn is deliberate.
    console.warn('[Pip] native module unavailable, Android PiP disabled', e);
  }
}

export default PipModule;