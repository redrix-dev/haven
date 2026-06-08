import type { HavenReactCore } from "./HavenReactCore";

let currentCore: HavenReactCore | null = null;

export function registerHavenCore(core: HavenReactCore): void {
  currentCore = core;
}

export function resetHavenCore(): void {
  currentCore = null;
}

export function getHavenCore(): HavenReactCore | null {
  return currentCore;
}

export function requireHavenCore(): HavenReactCore {
  if (!currentCore) {
    throw new Error(
      "HavenReactCore is not initialized. The host app must call createReactHavenCore({ client, publicConfig, persistence }) before rendering or importing features that touch Supabase.",
    );
  }
  return currentCore;
}
