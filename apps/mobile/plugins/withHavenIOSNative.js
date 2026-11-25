/**
 * Re-applies Haven’s iOS native setup after `npx expo prebuild` (or CI):
 * - Swift `ExpoAppDelegate` + `ExpoReactNativeFactory` + `startReactNative` (dev-client order fix; SDK 55 template)
 * - UIScene lifecycle: `SceneDelegate.swift` + `UIApplicationSceneManifest` in Info.plist (iOS 27
 *   terminates apps without it; Expo SDK 55 has no scene delegate of its own)
 * - PushKit → `react-native-voip-push-notification` via `HavenVoipPushBridge` + Swift bridging header
 * - Removes legacy `main.m` / ObjC `AppDelegate` from disk and the Xcode project when present
 *
 * Templates live in `plugins/haven-ios-native-templates/`; edit those files, then re-run prebuild.
 */
const fs = require("fs");
const path = require("path");
const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");
const {
  getProjectName,
  getHackyProjectName,
  addBuildSourceFileToGroup,
} = require(
  require.resolve("@expo/config-plugins/build/ios/utils/Xcodeproj", {
    // `@expo/config-plugins` is nested under `expo` in SDK 54+; resolve from the `expo` install.
    paths: [path.join(__dirname, "../node_modules/expo")],
  }),
);

const TEMPLATE_DIR = path.join(__dirname, "haven-ios-native-templates");
const TEMPLATE_SWIFT = path.join(TEMPLATE_DIR, "AppDelegate.swift");
const TEMPLATE_SCENE = path.join(TEMPLATE_DIR, "SceneDelegate.swift");
const TEMPLATE_BRIDGE_H = path.join(TEMPLATE_DIR, "HavenVoipPushBridge.h");
const TEMPLATE_BRIDGE_M = path.join(TEMPLATE_DIR, "HavenVoipPushBridge.m");
const TEMPLATE_BRIDGING = path.join(TEMPLATE_DIR, "Bridging-Header.h");

/** One window scene, delegated to `SceneDelegate` in the app module. */
const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withHavenIOSNative(config) {
  config = withInfoPlist(config, (conf) => {
    conf.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return conf;
  });
  return withXcodeProject(config, (conf) => {
    const { projectRoot, platformProjectRoot } = conf.modRequest;
    let projectName;
    try {
      projectName = getProjectName(projectRoot);
    } catch {
      projectName = getHackyProjectName(projectRoot, conf);
    }

    const appDir = path.join(platformProjectRoot, projectName);
    fs.mkdirSync(appDir, { recursive: true });

    if (!fs.existsSync(TEMPLATE_SWIFT)) {
      throw new Error(
        `[withHavenIOSNative] Missing template: ${TEMPLATE_SWIFT}. Reinstall or restore plugins/haven-ios-native-templates.`,
      );
    }

    fs.copyFileSync(TEMPLATE_SWIFT, path.join(appDir, "AppDelegate.swift"));
    fs.copyFileSync(TEMPLATE_SCENE, path.join(appDir, "SceneDelegate.swift"));
    fs.copyFileSync(
      TEMPLATE_BRIDGE_H,
      path.join(appDir, "HavenVoipPushBridge.h"),
    );
    fs.copyFileSync(
      TEMPLATE_BRIDGE_M,
      path.join(appDir, "HavenVoipPushBridge.m"),
    );
    const bridgingName = `${projectName}-Bridging-Header.h`;
    fs.copyFileSync(TEMPLATE_BRIDGING, path.join(appDir, bridgingName));

    for (const legacy of [
      "main.m",
      "AppDelegate.m",
      "AppDelegate.mm",
      "AppDelegate.h",
    ]) {
      const p = path.join(appDir, legacy);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* no-op */
        }
      }
    }

    const pr = conf.modResults;
    for (const name of ["HavenVoipPushBridge.m", "SceneDelegate.swift"]) {
      const rel = path.join(projectName, name);
      if (!pr.hasFile(rel) && !pr.hasFile(name)) {
        addBuildSourceFileToGroup({
          filepath: rel,
          groupName: projectName,
          project: pr,
          verbose: false,
        });
      }
    }

    const legacyRefs = [
      path.join(projectName, "main.m"),
      "main.m",
      path.join(projectName, "AppDelegate.mm"),
      "AppDelegate.mm",
      path.join(projectName, "AppDelegate.m"),
      "AppDelegate.m",
      path.join(projectName, "AppDelegate.h"),
      "AppDelegate.h",
    ];
    for (const rel of legacyRefs) {
      try {
        if (pr.hasFile(rel)) {
          pr.removeSourceFile(rel, {}, projectName);
        }
      } catch {
        /* no-op */
      }
    }

    setBridgingHeaderInAppTarget(
      pr,
      projectName,
      `${projectName}/${projectName}-Bridging-Header.h`,
    );

    return conf;
  });
}

/**
 * @param {import('xcode').XcodeProject} project
 * @param {string} projectName
 * @param {string} bridgingRelative
 */
function setBridgingHeaderInAppTarget(project, projectName, bridgingRelative) {
  const re = new RegExp(
    projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
  const section = project.pbxXCBuildConfigurationSection();
  for (const k of Object.keys(section)) {
    const entry = section[k];
    if (!entry || typeof entry !== "object" || !entry.buildSettings) {
      continue;
    }
    const { buildSettings } = entry;
    const listName = (entry.name && String(entry.name)) || "";
    if (listName.includes("Test")) {
      continue;
    }
    const info = buildSettings.INFOPLIST_FILE;
    if (!info) {
      continue;
    }
    const istr = String(info).replace(/^"|"$/g, "");
    if (re.test(istr) && !istr.includes("Tests")) {
      const quoted = `"${bridgingRelative}"`;
      buildSettings.SWIFT_OBJC_BRIDGING_HEADER = quoted;
    }
  }
}

module.exports = withHavenIOSNative;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
