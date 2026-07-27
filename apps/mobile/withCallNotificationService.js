const { withAndroidManifest } = require('expo/config-plugins');

const EXPO_SVC = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const OURS     = 'expo.modules.callnotification.OrbitFirebaseMessagingService';
const FCM_ACTION = 'com.google.firebase.MESSAGING_EVENT';

/**
 * Replaces expo-notifications' ExpoFirebaseMessagingService registration in the merged
 * AndroidManifest with our subclass, which calls super.onMessageReceived() so
 * expo-notifications keeps working. Having two services registered for the same intent
 * filter causes non-deterministic delivery, so we must remove Expo's entry first.
 */
module.exports = function withCallNotificationService(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.service = (app.service || []).filter(
      (s) => s.$['android:name'] !== EXPO_SVC,
    );
    app.service.push({
      $: { 'android:name': OURS, 'android:exported': 'false' },
      'intent-filter': [{
        action: [{ $: { 'android:name': FCM_ACTION } }],
      }],
    });
    return cfg;
  });
};
