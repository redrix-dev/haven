import { HavenCore, type HavenCoreOptions } from "./HavenCore";

let currentCore: HavenCore | null = null;

/**
 * Create the session-scoped composition root for the current host.
 * Replaces the legacy setHavenDataRuntime / initializeHavenDataFromClient pair.
 */
export function createHavenCore(options: HavenCoreOptions): HavenCore {
  const core = new HavenCore(options);
  currentCore = core;
  return core;
}

export function registerHavenCore(core: HavenCore): void {
  currentCore = core;
}

export function resetHavenCore(): void {
  currentCore = null;
}

export function getHavenCore(): HavenCore | null {
  return currentCore;
}

export function requireHavenCore(): HavenCore {
  if (!currentCore) {
    throw new Error(
      "HavenCore is not initialized. The host app must call createHavenCore({ client, publicConfig, persistence }) before rendering or importing features that touch Supabase.",
    );
  }
  return currentCore;
}
