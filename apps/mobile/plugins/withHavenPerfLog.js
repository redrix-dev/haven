const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject } = require("expo/config-plugins");
const { getProjectName, addBuildSourceFileToGroup } = require(
  require.resolve("@expo/config-plugins/build/ios/utils/Xcodeproj", {
    paths: [path.join(__dirname, "../node_modules/expo")],
  }),
);

const templates = path.join(__dirname, "haven-perf-log-templates");

/**
 * Installs `HavenPerfLog.m`, a tiny JS-callable RN module that mirrors
 * `perfTrace` lines into the iOS unified log (Console.app) via `os_log`, on the
 * same subsystem/category as the native boot marks. iOS only; on Android
 * `NativeModules.HavenPerfLog` is absent and the JS sink no-ops. Mirrors the
 * iOS half of `withHavenVoiceSounds`.
 */
module.exports = function withHavenPerfLog(config) {
  return withXcodeProject(config, (cfg) => {
    const name = getProjectName(cfg.modRequest.projectRoot);
    const relative = path.join(name, "HavenPerfLog.m");
    const destination = path.join(cfg.modRequest.platformProjectRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(templates, "HavenPerfLog.m"), destination);
    if (
      !cfg.modResults.hasFile(relative) &&
      !cfg.modResults.hasFile("HavenPerfLog.m")
    ) {
      addBuildSourceFileToGroup({
        filepath: relative,
        groupName: name,
        project: cfg.modResults,
        verbose: false,
      });
    }
    return cfg;
  });
};
