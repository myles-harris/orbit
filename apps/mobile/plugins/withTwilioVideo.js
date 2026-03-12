const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to add Twilio Video SDK to iOS and Android
 */
function withTwilioVideoIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Add TwilioVideo pod if not already present
      const twilioVideoPod = "  pod 'TwilioVideo', '~> 5.5'";

      if (!podfileContent.includes('TwilioVideo')) {
        // Find the target and add the pod
        const targetMatch = podfileContent.match(/target '.*?' do/);
        if (targetMatch) {
          const insertIndex = podfileContent.indexOf(targetMatch[0]) + targetMatch[0].length;
          podfileContent =
            podfileContent.slice(0, insertIndex) +
            '\n' + twilioVideoPod +
            podfileContent.slice(insertIndex);
        }
      }

      // Ensure bitcode is disabled
      if (!podfileContent.includes('post_install')) {
        podfileContent += `\n
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['ENABLE_BITCODE'] = 'NO'
    end
  end
end
`;
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
}

function withTwilioVideoAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );

      let buildGradleContent = fs.readFileSync(buildGradlePath, 'utf-8');

      // Add Twilio Video dependency
      const twilioVideoDep = "    implementation 'com.twilio:video-android:7.6.0'";

      if (!buildGradleContent.includes('video-android')) {
        // Find dependencies block and add Twilio
        const depsMatch = buildGradleContent.match(/dependencies\s*{/);
        if (depsMatch) {
          const insertIndex = buildGradleContent.indexOf(depsMatch[0]) + depsMatch[0].length;
          buildGradleContent =
            buildGradleContent.slice(0, insertIndex) +
            '\n' + twilioVideoDep +
            buildGradleContent.slice(insertIndex);
        }
      }

      fs.writeFileSync(buildGradlePath, buildGradleContent);
      return config;
    },
  ]);
}

module.exports = function withTwilioVideo(config) {
  return withPlugins(config, [
    withTwilioVideoIOS,
    withTwilioVideoAndroid,
  ]);
};