import type { StoreApi } from "zustand/vanilla";

/**
 * The read-only slice of a vanilla zustand store: read current state and
 * subscribe. Deliberately excludes `setState`, so code holding a React nexus
 * binding (`reactiveStore`) cannot write around the nexus's methods and
 * persistence.
 *
 * Matches zustand's own `ReadonlyStoreApi`, so it satisfies
 * `useStoreWithEqualityFn` / `useStore`.
 */
export type ReadableStore<S> = Pick<
  StoreApi<S>,
  "getState" | "getInitialState" | "subscribe"
>;
