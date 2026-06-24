import { createSolidHavenCore, type HavenSolidCore } from "@solid-client/core";
import { createLocalStoragePersistence } from "@shared/core";
import { getWebSupabase, getWebSupabaseConfig } from "./getWebSupabase";

/**
 * Builds the Haven core for the plain-browser (Vercel) web build.
 *
 * Identical to the Tauri core except for two shell choices: persistence is
 * always webview localStorage (no tauri-plugin-store), and no native bridge is
 * injected — `solid-client` runs in its portable browser mode (App with no
 * bridge; useBridge() falls back to web equivalents per capability).
 */
export function createWebHavenCore(): HavenSolidCore {
  return createSolidHavenCore({
    client: getWebSupabase(),
    publicConfig: getWebSupabaseConfig(),
    persistence: createLocalStoragePersistence(),
  });
}
