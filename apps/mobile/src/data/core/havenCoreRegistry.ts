import { HavenReactCore, type HavenReactCoreOptions } from "./HavenReactCore";
import { registerHavenCore as setHavenCoreRef } from "./havenCoreRef";
export {
  getHavenCore,
  registerHavenCore,
  requireHavenCore,
  resetHavenCore,
} from "./havenCoreRef";

/** Create the React-platform session composition root. */
export function createReactHavenCore(
  options: HavenReactCoreOptions,
): HavenReactCore {
  const core = new HavenReactCore(options);
  setHavenCoreRef(core);
  return core;
}

/** @deprecated Use createReactHavenCore */
export const createHavenCore = createReactHavenCore;
