import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { StoreApi } from "zustand/vanilla";

/**
 * Generic Solid adapter over a framework-agnostic vanilla zustand store.
 *
 * `fromStore` is the keystone primitive (validated in the Gate-1 `@shared` probe):
 * subscribe → signal. Per-domain Solid accessors (`createProfile`, …) compose it.
 * Consumed by solid-client (tauri) now, and future solid-web.
 */
export function fromStore<S>(store: StoreApi<S>): Accessor<S> {
  const [state, setState] = createSignal<S>(store.getState());
  const unsubscribe = store.subscribe((next) => setState(() => next));
  onCleanup(unsubscribe);
  return state;
}

/**
 * Derive a reactive slice. The selector runs inside a memo, so it re-derives on
 * BOTH store changes and any reactive sources it reads — which is how **getter ids**
 * work (Solid tracks at access time):
 *
 *   createStoreSelector(store, (s) => s.profiles[id()])  // re-runs when id() changes
 */
export function createStoreSelector<S, T>(
  store: StoreApi<S>,
  selector: (state: S) => T,
  equals?: (a: T, b: T) => boolean,
): Accessor<T> {
  const state = fromStore(store);
  return createMemo(
    () => selector(state()),
    undefined,
    equals ? { equals } : undefined,
  );
}
