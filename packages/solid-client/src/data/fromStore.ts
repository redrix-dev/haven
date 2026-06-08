import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { ReadableStore } from "@shared/nexus/storeTypes";

/**
 * Subscribe a Solid signal to a readable store. Uses a tick counter because
 * Solid store proxies keep stable identity across mutations.
 */
export function fromStore<S>(store: ReadableStore<S>): Accessor<S> {
  const [tick, setTick] = createSignal(0);
  const unsubscribe = store.subscribe(() => {
    setTick((value) => value + 1);
  });
  onCleanup(unsubscribe);
  return () => {
    tick();
    return store.getState();
  };
}

export function createStoreSelector<S, T>(
  store: ReadableStore<S>,
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
