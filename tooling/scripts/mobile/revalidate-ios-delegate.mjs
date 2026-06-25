/**
 * After `expo prebuild`, verify Haven iOS templates + generated AppDelegate still match expectations.
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
  "HavenVoipPushBridge.m",
  "HavenVoipPushBridge.h",
  "Bridging-Header.h",
];

function fail(msg) {
  console.error(`[revalidate-ios-delegate] ${msg}`);
  process.exit(1);
}

for (const name of requiredTemplates) {
  const p = path.join(templateDir, name);
  if (!fs.existsSync(p)) {
    fail(`Missing template: ${path.relative(repoRoot, p)}`);
  }
}

const swiftTemplate = fs.readFileSync(
  path.join(templateDir, "AppDelegate.swift"),
  "utf8",
);
for (const needle of [
  "ExpoReactNativeFactory",
  "startReactNative",
  "internal import Expo",
]) {
  if (!swiftTemplate.includes(needle)) {
    fail(`Template AppDelegate.swift must include "${needle}"`);
  }
}

const generated = path.join(iosAppDir, "AppDelegate.swift");
if (fs.existsSync(generated)) {
  const body = fs.readFileSync(generated, "utf8");
  for (const needle of [
    "ExpoReactNativeFactory",
    "startReactNative",
    "internal import Expo",
  ]) {
    if (!body.includes(needle)) {
      fail(
        `Generated ${path.relative(repoRoot, generated)} missing "${needle}" — re-run prebuild with withHavenIOSNative last in app.json plugins`,
      );
    }
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
