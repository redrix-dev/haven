import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");

function run(name, command, args, options = {}) {
  console.log(`\n[mobile:doctor] ${name}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("Preflight checks", "node", ["tooling/scripts/mobile/preflight.mjs"]);
run("Shared portable boundary", "node", [
  "tooling/scripts/check-shared-portable.mjs",
]);
run("Dependency ownership checks", "node", [
  "tooling/scripts/mobile/check-dependency-ownership.mjs",
]);
run("Expo config resolution", "npx", ["expo", "config", "--type", "public"], {
  cwd: mobileRoot,
});
run("expo-doctor (SDK / Metro / native alignment)", "npx", ["expo-doctor"], {
  cwd: mobileRoot,
});

console.log("\n[mobile:doctor] OK");
