const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Adds android:supportsPictureInPicture="true" to MainActivity so that
 * enterPictureInPictureMode() is honoured by the OS. Without this flag the
 * call is silently ignored even on API 26+.
 */
module.exports = function withPip(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    const main = (app.activity || []).find(
      (a) => a.$['android:name'] === '.MainActivity'
    );
    if (main) {
      main.$['android:supportsPictureInPicture'] = 'true';
    }
    return config;
  });
};
