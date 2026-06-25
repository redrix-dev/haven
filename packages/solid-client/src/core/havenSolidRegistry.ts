import { HavenSolidCore, type HavenSolidCoreOptions } from "./HavenSolidCore";
import { registerHavenSolidCore as setHavenSolidCoreRef } from "./havenSolidRef";

export {
  getHavenSolidCore,
  registerHavenSolidCore,
  requireHavenSolidCore,
  resetHavenSolidCore,
} from "./havenSolidRef";

/** Create the Solid-platform session composition root. */
export function createSolidHavenCore(
  options: HavenSolidCoreOptions,
): HavenSolidCore {
  const core = new HavenSolidCore(options);
  setHavenSolidCoreRef(core);
  return core;
}
