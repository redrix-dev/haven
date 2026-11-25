import { createSolidHavenCore, type HavenSolidCore } from "@solid-client/core";
import { createLocalStoragePersistence } from "@shared/core/persistence/createLocalStoragePersistence";
import { getWebSupabase } from "./getWebSupabase";

/**
 * Builds the Haven core for the plain-browser (Vercel) web build.
 *
 * Identical to the Tauri core except for the shell's choices: device storage
 * is the browser's localStorage, and no native bridge is injected, so
 * `solid-client` runs in its portable browser mode.
 */
export function createWebHavenCore(): HavenSolidCore {
  return createSolidHavenCore({
    client: getWebSupabase(),
    persistence: createLocalStoragePersistence(),
    context: { platform: "web", distribution: "all" },
  });
}
