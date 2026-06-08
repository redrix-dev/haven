import type { ReadableStore } from "@shared/nexus/storeTypes";

export type NotifyingReadableStore<S> = ReadableStore<S> & {
  notify: () => void;
};

/** Bridge a Solid store proxy to the vanilla ReadableStore subscribe API. */
export function wireSolidReadableStore<S extends object>(
  state: S,
): NotifyingReadableStore<S> {
  const listeners = new Set<(state: S, prevState: S) => void>();
  let prev = state;
  const notify = () => {
    const next = state;
    for (const listener of listeners) {
      listener(next, prev);
    }
    prev = next;
  };
  return {
    getState: () => state,
    getInitialState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state, state);
      return () => {
        listeners.delete(listener);
      };
    },
    notify,
  };
}
