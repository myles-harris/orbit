const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withTwilioVideoUpdate(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Add post_install hook to update TwilioVideo version
      const postInstallHook = `
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['ENABLE_BITCODE'] = 'NO'
    end
  end

  # Update TwilioVideo to 5.5+ to remove bitcode
  installer.pods_project.dependencies.each do |dep|
    if dep.name == 'TwilioVideo'
      dep.requirement = Gem::Requirement.new('>= 5.5')
    end
  end
end
`;

      // Remove existing post_install if present
      podfileContent = podfileContent.replace(/post_install do \|installer\|[\s\S]*?^end/m, '');

      // Add our post_install hook at the end
      podfileContent += '\n' + postInstallHook;

      fs.writeFileSync(podfilePath, podfileContent);

      return config;
    },
  ]);
};