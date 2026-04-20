import type { HavenSupabaseClient } from "@shared/lib/createHavenSupabaseClient";
import { createHavenDataRuntime, type HavenSupabasePublicConfig } from "@shared/runtime/havenDataRuntime";
import { setHavenDataRuntime } from "@shared/runtime/havenRuntimeRegistry";

/**
 * Web / Electron / RN entry helper: wires the global Haven runtime from an existing client.
 */
export function initializeHavenDataFromClient(
  client: HavenSupabaseClient,
  publicConfig: HavenSupabasePublicConfig,
): void {
  setHavenDataRuntime(createHavenDataRuntime(client, publicConfig));
}
