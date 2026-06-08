import { useSyncExternalStore } from "react";
import { requireHavenCore } from "./havenCoreRegistry";
import type { HavenReactCore } from "./HavenReactCore";
import type { BootstrapPhaseSnapshot } from "./bootstrapPhase";

/**
 * Access the active HavenReactCore from inside React.
 * The instance reference is stable for the lifetime of a session.
 */
export function useHavenCore(): HavenReactCore {
  return requireHavenCore();
}

/** Subscribe to bootstrap phase changes (splash/loading UI). */
export function useBootstrapPhase(): BootstrapPhaseSnapshot {
  const core = useHavenCore();
  return useSyncExternalStore(
    (listener) => core.subscribeBootstrapPhase(listener),
    () => core.getBootstrapPhase(),
    () => core.getBootstrapPhase(),
  );
}
