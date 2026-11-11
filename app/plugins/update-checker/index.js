// Expo config plugin: adds the shared AppUpdateChecker.swift to the iOS target,
// merges the Info.plist keys it needs and starts it from AppDelegate.
const fs = require('fs');
const path = require('path');
const {
  withDangerousMod, withXcodeProject, withInfoPlist, withAppDelegate, IOSConfig,
} = require('expo/config-plugins');

const SLUG = 'dataserver';
const FILE = 'AppUpdateChecker.swift';

module.exports = function withUpdateChecker(config) {
  config = withInfoPlist(config, (c) => {
    const modes = new Set(c.modResults.UIBackgroundModes || []);
    modes.add('fetch');
    c.modResults.UIBackgroundModes = [...modes];
    const ids = new Set(c.modResults.BGTaskSchedulerPermittedIdentifiers || []);
    ids.add('nl.jdries.updatecheck');
    c.modResults.BGTaskSchedulerPermittedIdentifiers = [...ids];
    return c;
  });

  config = withDangerousMod(config, ['ios', (c) => {
    const dest = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName, FILE);
    fs.copyFileSync(path.join(__dirname, FILE), dest);
    return c;
  }]);

  config = withXcodeProject(config, (c) => {
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: path.join(c.modRequest.projectName, FILE),
      groupName: c.modRequest.projectName,
      project: c.modResults,
    });
    return c;
  });

  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') throw new Error('update-checker plugin expects a Swift AppDelegate');
    let src = c.modResults.contents;
    if (!src.includes('AppUpdateChecker.start')) {
      const re = /(didFinishLaunchingWithOptions[^{]*\{\n)/;
      if (!re.test(src)) throw new Error('update-checker: didFinishLaunchingWithOptions not found');
      src = src.replace(re, `$1    AppUpdateChecker.start(slug: "${SLUG}")\n`);
    }
    c.modResults.contents = src;
    return c;
  });
  return config;
};
