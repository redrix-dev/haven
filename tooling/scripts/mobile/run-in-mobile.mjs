/**
 * Runs a command with cwd = apps/mobile (so Metro, Expo, and EAS resolve paths correctly).
 *
 * Repo-root wrappers (see root package.json `mobile:*`):
 * - mobile:dev:metro / mobile:start — JS only: Expo dev server (dev client). Does not reinstall the app.
 * - mobile:dev:metro:clear / mobile:start:clear — same, clears Metro/JS cache (--clear).
 * - mobile:run:ios:simulator / mobile:ios — native compile + install on iOS Simulator.
 * - mobile:run:ios:device / mobile:ios:device — native compile + install on a USB/paired iPhone.
 * - mobile:run:android / mobile:android — native compile + run Android.
 * - mobile:native:prebuild / mobile:prebuild — regenerate ios/ and android/ from Expo config (no device install).
 * - mobile:eas:* — cloud EAS builds (artifact you install separately).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    "Usage: node tooling/scripts/mobile/run-in-mobile.mjs <command> [args...]",
  );
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  cwd: mobileRoot,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
