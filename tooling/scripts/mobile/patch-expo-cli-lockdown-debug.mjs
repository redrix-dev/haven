import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const target = path.join(
  repoRoot,
  "apps/mobile/node_modules/expo/node_modules/@expo/cli/build/src/run/ios/appleDevice/client/LockdowndClient.js",
);

const unsafe = "debug(`startSession: ${pairRecord}`);";
const safe = "debug('startSession');";

if (!fs.existsSync(target)) {
  console.warn(`[mobile:patch-expo-cli] Skipping missing ${target}`);
  process.exit(0);
}

const contents = fs.readFileSync(target, "utf8");
if (contents.includes(safe)) {
  console.log(
    "[mobile:patch-expo-cli] Expo CLI lockdown debug patch already applied.",
  );
  process.exit(0);
}

if (!contents.includes(unsafe)) {
  console.warn(
    "[mobile:patch-expo-cli] Expo CLI lockdown debug line not found; leaving file unchanged.",
  );
  process.exit(0);
}

fs.writeFileSync(target, contents.replace(unsafe, safe));
console.log("[mobile:patch-expo-cli] Patched Expo CLI lockdown debug logging.");
