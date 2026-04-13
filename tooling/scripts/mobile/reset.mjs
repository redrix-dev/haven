import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileRoot = path.join(repoRoot, "apps/mobile");

for (const entry of [".expo", "ios", "node_modules"]) {
  const target = path.join(mobileRoot, entry);
  await fs.rm(target, { recursive: true, force: true });
}

const result = spawnSync("npm", ["ci"], {
  cwd: mobileRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[mobile:reset] OK");
