import type { HavenSolidCore } from "./HavenSolidCore";

let currentCore: HavenSolidCore | null = null;

export function registerHavenSolidCore(core: HavenSolidCore): void {
  currentCore = core;
}

export function resetHavenSolidCore(): void {
  currentCore = null;
}

export function getHavenSolidCore(): HavenSolidCore | null {
  return currentCore;
}

export function requireHavenSolidCore(): HavenSolidCore {
  if (!currentCore) {
    throw new Error(
      "HavenSolidCore is not initialized. The host app must call createSolidHavenCore({ client, publicConfig, persistence }) before rendering.",
    );
  }
  return currentCore;
}
