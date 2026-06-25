import type { StoreApi } from "zustand/vanilla";

/**
 * The read-only slice of a vanilla store that the binding packages need:
 * read current state + subscribe to changes. Deliberately excludes `setState`
 * so consumers (React/Solid adapters, anything holding a nexus reference) cannot
 * mutate store state directly and bypass the owning class's action methods,
 * persistence, and revision bookkeeping.
 *
 * Matches zustand's own `ReadonlyStoreApi`, so it satisfies
 * `useStoreWithEqualityFn`/`useStore`; Solid's `fromStore` uses a subset.
 */
export type ReadableStore<S> = Pick<
  StoreApi<S>,
  "getState" | "getInitialState" | "subscribe"
>;
