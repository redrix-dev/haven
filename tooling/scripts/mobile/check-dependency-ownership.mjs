import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const rootPackageJsonPath = path.join(repoRoot, "package.json");
const mobilePackageJsonPath = path.join(repoRoot, "apps/mobile/package.json");

const rootPackageJson = JSON.parse(
  fs.readFileSync(rootPackageJsonPath, "utf8"),
);
const mobilePackageJson = JSON.parse(
  fs.readFileSync(mobilePackageJsonPath, "utf8"),
);

const rootDeps = {
  ...(rootPackageJson.dependencies ?? {}),
  ...(rootPackageJson.devDependencies ?? {}),
};
const mobileDeps = {
  ...(mobilePackageJson.dependencies ?? {}),
  ...(mobilePackageJson.devDependencies ?? {}),
};

const rootForbidden = [
  "expo",
  "react-native",
  "expo-dev-client",
  "expo-asset",
  "expo-constants",
  "expo-linking",
  // React is mobile-owned after the cleave; the root install must stay
  // framework-free apart from Solid.
  "react",
  "react-dom",
];

const mobileForbidden = [
  "vite",
  "vite-plugin-solid",
  "solid-js",
  "@tauri-apps/api",
  "@tauri-apps/cli",
];

const violations = [];

for (const dep of rootForbidden) {
  if (rootDeps[dep]) {
    violations.push(
      `Root package.json must not include mobile dependency "${dep}".`,
    );
  }
}

for (const dep of mobileForbidden) {
  if (mobileDeps[dep]) {
    violations.push(
      `apps/mobile/package.json must not include desktop/web tooling dependency "${dep}".`,
    );
  }
}

if (violations.length > 0) {
  console.error("[mobile:ownership] Dependency ownership violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("[mobile:ownership] OK");
