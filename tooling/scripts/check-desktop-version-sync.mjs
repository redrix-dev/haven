import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCargoVersion(relativePath) {
  const filePath = path.join(root, relativePath);
  const contents = fs.readFileSync(filePath, "utf8");
  const match = contents.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not parse version from ${relativePath}`);
  }
  return match[1];
}

const packageVersion = readJson("package.json").version;
const tauriVersion = readJson("apps/tauri/src-tauri/tauri.conf.json").version;
const cargoVersion = readCargoVersion("apps/tauri/src-tauri/Cargo.toml");

const versions = {
  "package.json": packageVersion,
  "apps/tauri/src-tauri/tauri.conf.json": tauriVersion,
  "apps/tauri/src-tauri/Cargo.toml": cargoVersion,
};

const unique = new Set(Object.values(versions));
if (unique.size === 1) {
  console.log(`Desktop version sync OK: ${packageVersion}`);
  process.exit(0);
}

console.error("Desktop version mismatch:");
for (const [file, version] of Object.entries(versions)) {
  console.error(`  ${file}: ${version}`);
}
process.exit(1);
