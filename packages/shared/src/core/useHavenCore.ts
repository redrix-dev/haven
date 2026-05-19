import { useSyncExternalStore } from "react";
import { requireHavenCore } from "./havenCoreRegistry";
import type { HavenCore } from "./HavenCore";
import type { BootstrapPhaseSnapshot } from "./bootstrapPhase";

/**
 * Access the active HavenCore from inside React.
 * The instance reference is stable for the lifetime of a session, so this
 * returns the same value every render without subscribing to anything.
 */
export function useHavenCore(): HavenCore {
  return requireHavenCore();
}

/**
 * Subscribe to bootstrap phase changes (splash/loading UI).
 */
export function useBootstrapPhase(): BootstrapPhaseSnapshot {
  const core = useHavenCore();
  return useSyncExternalStore(
    (listener) => core.subscribeBootstrapPhase(listener),
    () => core.getBootstrapPhase(),
    () => core.getBootstrapPhase(),
  );
}
