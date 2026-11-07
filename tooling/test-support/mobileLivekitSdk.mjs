import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Node-only fixture for testing the exact SDK artifacts Metro can consume.
// Keep filesystem/package-loader APIs out of mobile runtime source. Like the
// repo's Vitest command, this fixture runs from the repository root.
const mobileRequire = createRequire(path.resolve("apps/mobile/package.json"));

/** @param {"umd" | "esm"} format @returns {Promise<unknown>} */
export async function loadMobileLivekitSdk(format) {
  if (format === "umd") return mobileRequire("livekit-client");
  const dir = path.dirname(mobileRequire.resolve("livekit-client"));
  return import(pathToFileURL(path.join(dir, "livekit-client.esm.mjs")).href);
}
