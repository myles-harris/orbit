const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const EXPO_SVC = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const OURS     = 'expo.modules.callnotification.OrbitFirebaseMessagingService';
const FCM_ACTION = 'com.google.firebase.MESSAGING_EVENT';

/**
 * Replaces expo-notifications' ExpoFirebaseMessagingService registration in the merged
 * AndroidManifest with our subclass, which calls super.onMessageReceived() so
 * expo-notifications keeps working. Having two services registered for the same intent
 * filter causes non-deterministic delivery, so we must remove Expo's entry first.
 */
function withServiceManifestEntry(config) {
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
}

/**
 * :app:lintVitalRelease (release-only, so no dev-profile build ever ran it) flags the
 * service above with "OrbitFirebaseMessagingService must extend android.app.Service
 * [Instantiatable]", even though it compiles cleanly and its whole point is extending
 * ExpoFirebaseMessagingService -> FirebaseMessagingService -> Service. Confirmed a Lint
 * Vital false positive, not a real defect: Lint Vital's partial per-module analysis
 * doesn't resolve a superclass chain that crosses into another module's dependency
 * (compileOnly vs implementation makes no difference), which is exactly what Lint's own
 * "consider disabling this Lint issue to avoid false positives" text is pointing at here.
 */
function withInstantiatableLintFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("disable 'Instantiatable'")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /^android \{/m,
        `android {\n    lint {\n        disable 'Instantiatable'\n    }`,
      );
    }
    return cfg;
  });
}

module.exports = function withCallNotificationService(config) {
  return withInstantiatableLintFix(withServiceManifestEntry(config));
};
