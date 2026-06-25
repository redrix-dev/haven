import { dataCacheDebug } from "@shared/debug";
import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  return dataCacheDebug.subscribe(listener);
}

function getSnapshot() {
  return dataCacheDebug.getEntries().length;
}

/** Re-renders when the debug log receives new entries. Pass `active: false` when modal is closed. */
export function useDataCacheDebugRevision(active = true): number {
  return useSyncExternalStore(
    subscribe,
    () => (active ? getSnapshot() : 0),
    () => 0,
  );
}
