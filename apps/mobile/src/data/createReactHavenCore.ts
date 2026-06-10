import { createReactHavenCore as createCore } from "./core/havenCoreRegistry";
import type { HavenReactCoreOptions } from "./core/HavenReactCore";
import type { HavenReactCore } from "./core/HavenReactCore";

export type ReactHavenCoreOptions = HavenReactCoreOptions;

/** Bootstrap HavenReactCore with the React-platform cache (mobile). */
export function createReactHavenCore(
  options: ReactHavenCoreOptions,
): HavenReactCore {
  return createCore(options);
}

/** @deprecated Use createReactHavenCore */
export const createMobileHavenCore = createReactHavenCore;

export function createReactHavenCoreOptions(
  base: ReactHavenCoreOptions,
): HavenReactCoreOptions {
  return base;
}
