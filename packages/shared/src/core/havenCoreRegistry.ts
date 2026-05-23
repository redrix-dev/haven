import { HavenCore, type HavenCoreOptions } from "./HavenCore";
import { registerHavenCore as setHavenCoreRef } from "./havenCoreRef";
export {
  getHavenCore,
  registerHavenCore,
  requireHavenCore,
  resetHavenCore,
} from "./havenCoreRef";

/**
 * Create the session-scoped composition root for the current host.
 * Replaces the legacy setHavenDataRuntime / initializeHavenDataFromClient pair.
 */
export function createHavenCore(options: HavenCoreOptions): HavenCore {
  const core = new HavenCore(options);
  setHavenCoreRef(core);
  return core;
}
