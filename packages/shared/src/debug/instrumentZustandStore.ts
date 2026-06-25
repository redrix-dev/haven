import type { StoreApi } from "zustand/vanilla";
import { dataCacheDebug } from "./dataCacheDebug";
import { safeSerializeDebugValue } from "./safeSerializeDebugValue";

const IGNORED_ACTION_KEYS = new Set([
  "setState",
  "getState",
  "getInitialState",
  "subscribe",
  "destroy",
]);

function pickStateSlice<T extends object>(state: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "function") continue;
    if (IGNORED_ACTION_KEYS.has(key)) continue;
    out[key] = safeSerializeDebugValue(value);
  }
  return out;
}

function diffKeys(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/** Subscribes to a Zustand store and logs state transitions. */
export function instrumentZustandStore<T extends object>(
  store: StoreApi<T>,
  storeName: string,
): () => void {
  let prev = pickStateSlice(store.getState());

  dataCacheDebug.store(storeName, "instrumented", {
    initialKeys: Object.keys(prev),
  });

  return store.subscribe((state) => {
    const next = pickStateSlice(state);
    const changedKeys = diffKeys(prev, next);
    if (changedKeys.length === 0) return;

    const patch: Record<string, unknown> = {};
    for (const key of changedKeys) {
      patch[key] = next[key];
    }

    dataCacheDebug.store(storeName, `changed: ${changedKeys.join(", ")}`, {
      changedKeys,
      patch,
    });

    prev = next;
  });
}
