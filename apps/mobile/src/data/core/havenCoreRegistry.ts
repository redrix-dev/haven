import { HavenReactCore, type HavenReactCoreOptions } from "./HavenReactCore";
import { registerHavenCore } from "./havenCoreRef";
export {
  getHavenCore,
  registerHavenCore,
  requireHavenCore,
  resetHavenCore,
} from "./havenCoreRef";

/** Create mobile's HavenCore and make it the one `requireHavenCore` returns. */
export function createReactHavenCore(
  options: HavenReactCoreOptions,
): HavenReactCore {
  const core = new HavenReactCore(options);
  registerHavenCore(core);
  return core;
}
