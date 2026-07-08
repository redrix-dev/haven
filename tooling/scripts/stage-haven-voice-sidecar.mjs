// Build the haven-voice native voice sidecar and stage it where Tauri's
// bundler expects an `externalBin` (see apps/tauri/src-tauri/tauri.linux.conf.json).
//
// Tauri requires the binary to carry a `-<target-triple>` suffix at bundle time
// (it strips the suffix when placing it next to the app exe in the package).
// This script builds the sidecar's standalone workspace, discovers the host
// triple from rustc, and copies the artifact to
//   apps/tauri/src-tauri/binaries/haven-voice-<triple>[.exe]
//
// Usage:
//   node tooling/scripts/stage-haven-voice-sidecar.mjs           # release
//   node tooling/scripts/stage-haven-voice-sidecar.mjs --debug   # debug
//
// Run this before `tauri build` / `tauri dev` on Linux (CI does this on the
// Linux leg of release-desktop.yml). It's a no-op contract on other platforms
// today — the sidecar only bundles on Linux until desktop unification lands.

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sidecarDir = join(repoRoot, "apps", "tauri", "haven-voice");
const binariesDir = join(repoRoot, "apps", "tauri", "src-tauri", "binaries");

const profile = process.argv.includes("--debug") ? "debug" : "release";
const cargoArgs = ["build", "--locked"];
if (profile === "release") cargoArgs.push("--release");

console.log(`[stage-sidecar] building haven-voice (${profile})…`);
execFileSync("cargo", cargoArgs, { cwd: sidecarDir, stdio: "inherit" });

// Host target triple, e.g. x86_64-unknown-linux-gnu.
const rustcInfo = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const tripleMatch = rustcInfo.match(/^host:\s*(.+)$/m);
if (!tripleMatch) {
  throw new Error("[stage-sidecar] could not determine host target triple from `rustc -vV`");
}
const triple = tripleMatch[1].trim();

const ext = process.platform === "win32" ? ".exe" : "";
const src = join(sidecarDir, "target", profile, `haven-voice${ext}`);
const dest = join(binariesDir, `haven-voice-${triple}${ext}`);

mkdirSync(binariesDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[stage-sidecar] staged ${src} -> ${dest}`);
