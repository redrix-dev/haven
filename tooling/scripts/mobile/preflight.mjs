import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");
const mobilePackageJsonPath = path.join(mobileRoot, "package.json");

const strictMode = process.argv.includes("--strict");

function fail(message) {
  console.error(`[mobile:preflight] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(mobilePackageJsonPath)) {
  fail(`Could not find mobile package.json at ${mobilePackageJsonPath}`);
}

const mobilePackageJson = JSON.parse(fs.readFileSync(mobilePackageJsonPath, "utf8"));
const dependencies = {
  ...(mobilePackageJson.dependencies ?? {}),
  ...(mobilePackageJson.devDependencies ?? {}),
};

const requiredPackages = [
  "expo",
  "react-native",
  "expo-asset",
  "expo-dev-client",
  "react-native-reanimated",
];

if (strictMode && process.cwd() !== mobileRoot) {
  fail(`Expected cwd ${mobileRoot} but found ${process.cwd()}. Run through root wrappers or cd into apps/mobile.`);
}

const mobileRequire = createRequire(path.join(mobileRoot, "package.json"));

for (const pkg of requiredPackages) {
  if (!dependencies[pkg]) {
    fail(`Missing ${pkg} in apps/mobile/package.json dependencies.`);
  }

  try {
    mobileRequire.resolve(`${pkg}/package.json`);
  } catch {
    fail(`Package ${pkg} is declared but not installed in apps/mobile/node_modules.`);
  }
}

try {
  mobileRequire.resolve("react-native-reanimated/plugin");
} catch {
  fail("Missing react-native-reanimated Babel plugin. Ensure react-native-reanimated is installed.");
}

const checkChatSurface = path.join(repoRoot, "tooling/scripts/check-chat-surface.mjs");
if (fs.existsSync(checkChatSurface)) {
  const result = spawnSync(process.execPath, [checkChatSurface], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[mobile:preflight] OK");
