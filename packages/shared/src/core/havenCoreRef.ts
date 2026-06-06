import type { HavenCore } from "./HavenCore";

let currentCore: HavenCore | null = null;

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
