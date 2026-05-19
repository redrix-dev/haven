import type { HavenSupabaseClient } from "@shared/infrastructure/client/createHavenSupabaseClient";
import { createHavenDataRuntime, type HavenSupabasePublicConfig } from "@shared/infrastructure/runtime/havenDataRuntime";
import { setHavenDataRuntime } from "@shared/infrastructure/runtime/havenRuntimeRegistry";

/**
 * Web / Electron / RN entry helper: wires the global Haven runtime from an existing client.
 */
export function initializeHavenDataFromClient(
  client: HavenSupabaseClient,
  publicConfig: HavenSupabasePublicConfig,
): void {
  setHavenDataRuntime(createHavenDataRuntime(client, publicConfig));
}
