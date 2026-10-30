/**
 * After `expo prebuild`, verify Haven iOS templates + generated App/SceneDelegate, the Info.plist
 * scene manifest, and the Xcode project still match expectations.
 * Optional: run xcodebuild if apps/mobile/ios exists (simulator, generic destination).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");
const templateDir = path.join(mobileRoot, "plugins/haven-ios-native-templates");
const iosAppDir = path.join(mobileRoot, "ios/HavenMobile");

const requiredTemplates = [
  "AppDelegate.swift",
  "SceneDelegate.swift",
  "HavenVoipPushBridge.m",
  "HavenVoipPushBridge.h",
  "Bridging-Header.h",
];

// UIScene lifecycle (iOS 27 terminates apps without it): the app delegate only builds the
// factory; the scene delegate owns the window and starts React Native into it. Starting it
// in both would make two windows, so the app delegate must not call startReactNative.
const swiftExpectations = {
  "AppDelegate.swift": {
    includes: ["ExpoReactNativeFactory", "internal import Expo"],
    excludes: [".startReactNative(", "UIWindow(frame:"],
  },
  "SceneDelegate.swift": {
    includes: [
      "UIWindowSceneDelegate",
      "UIWindow(windowScene:",
      ".startReactNative(",
      "openURLContexts",
      "continue userActivity",
    ],
    excludes: [],
  },
};

function fail(msg) {
  console.error(`[revalidate-ios-delegate] ${msg}`);
  process.exit(1);
}

function checkSwift(file, label) {
  const body = fs.readFileSync(file, "utf8");
  const { includes, excludes } = swiftExpectations[path.basename(file)];
  for (const needle of includes) {
    if (!body.includes(needle)) fail(`${label} must include "${needle}"`);
  }
  for (const needle of excludes) {
    if (body.includes(needle)) fail(`${label} must not include "${needle}"`);
  }
}

for (const name of requiredTemplates) {
  const p = path.join(templateDir, name);
  if (!fs.existsSync(p)) {
    fail(`Missing template: ${path.relative(repoRoot, p)}`);
  }
}

for (const name of Object.keys(swiftExpectations)) {
  checkSwift(path.join(templateDir, name), `Template ${name}`);
}

const regenerate =
  "re-run prebuild with withHavenIOSNative last in app.json plugins";
if (fs.existsSync(path.join(iosAppDir, "AppDelegate.swift"))) {
  for (const name of Object.keys(swiftExpectations)) {
    const generated = path.join(iosAppDir, name);
    const label = `Generated ${path.relative(repoRoot, generated)}`;
    if (!fs.existsSync(generated)) fail(`${label} is missing — ${regenerate}`);
    checkSwift(generated, `${label} (${regenerate})`);
  }

  const plist = fs.readFileSync(path.join(iosAppDir, "Info.plist"), "utf8");
  for (const needle of [
    "<key>UIApplicationSceneManifest</key>",
    "<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>",
  ]) {
    if (!plist.includes(needle)) {
      fail(`Generated Info.plist missing ${needle} — ${regenerate}`);
    }
  }

  const pbxproj = fs.readFileSync(
    path.join(mobileRoot, "ios/HavenMobile.xcodeproj/project.pbxproj"),
    "utf8",
  );
  if (!pbxproj.includes("SceneDelegate.swift in Sources")) {
    fail(`SceneDelegate.swift is not compiled by the app target — ${regenerate}`);
  }
} else {
  console.warn(
    "[revalidate-ios-delegate] No apps/mobile/ios/HavenMobile/AppDelegate.swift (prebuild not run or ios/ missing). Template checks only.",
  );
}

const workspace = path.join(mobileRoot, "ios/HavenMobile.xcworkspace");
if (fs.existsSync(workspace) && process.env.SKIP_XCODEBUILD !== "1") {
  console.log(
    "[revalidate-ios-delegate] xcodebuild -workspace HavenMobile.xcworkspace -scheme HavenMobile -destination 'generic/platform=iOS' -configuration Debug CODE_SIGNING_ALLOWED=NO build",
  );
  const r = spawnSync(
    "xcodebuild",
    [
      "-workspace",
      workspace,
      "-scheme",
      "HavenMobile",
      "-destination",
      "generic/platform=iOS",
      "-configuration",
      "Debug",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
    { cwd: mobileRoot, stdio: "inherit", env: process.env },
  );
  if (r.status !== 0) {
    fail("xcodebuild failed (set SKIP_XCODEBUILD=1 to skip native compile)");
  }
} else if (!fs.existsSync(workspace)) {
  console.warn(
    "[revalidate-ios-delegate] Skipping xcodebuild: ios/HavenMobile.xcworkspace not found",
  );
}

console.log("[revalidate-ios-delegate] OK");
