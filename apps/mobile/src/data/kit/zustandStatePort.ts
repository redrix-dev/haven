import { createStore, type StoreApi } from "zustand/vanilla";
import type { StatePort } from "@shared/nexus/kit/statePort";

/** A state port backed by a vanilla zustand store, plus the store for React hooks. */
export type ZustandStatePort<S extends object> = StatePort<S> & {
  /** Subscribe to this from React selector hooks (`useStoreSelector`). */
  readonly store: StoreApi<S>;
};

/**
 * Mobile's state container for shared nexuses. Writes merge top-level keys and
 * produce a new state object; unchanged slices keep their references, so the
 * selector hooks' equality checks skip re-renders as before.
 */
export function createZustandStatePort<S extends object>(
  initial: S,
): ZustandStatePort<S> {
  const store = createStore<S>()(() => initial);
  return {
    store,
    get: store.getState,
    set: (partial) => store.setState(partial),
  };
}
