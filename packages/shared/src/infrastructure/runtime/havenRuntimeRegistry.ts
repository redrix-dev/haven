import type { HavenDataRuntime } from "./havenDataRuntime";

let currentRuntime: HavenDataRuntime | null = null;

/**
 * Hosts (web, electron renderer, RN, tests) must call this once before any
 * shared code uses `get*Backend()` or `requireHavenDataRuntime()`.
 */
export function setHavenDataRuntime(runtime: HavenDataRuntime): void {
  currentRuntime = runtime;
}

export function resetHavenDataRuntime(): void {
  currentRuntime = null;
}

export function getHavenDataRuntime(): HavenDataRuntime | null {
  return currentRuntime;
}

export function requireHavenDataRuntime(): HavenDataRuntime {
  if (!currentRuntime) {
    throw new Error(
      "Haven data runtime is not initialized. The host app must call setHavenDataRuntime(createHavenDataRuntime(...)) before rendering or importing features that touch Supabase.",
    );
  }
  return currentRuntime;
}
