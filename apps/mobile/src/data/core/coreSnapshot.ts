import type { StoreApi } from "zustand/vanilla";
import type {
  StoreName,
  StoreStates,
} from "@shared/collections/core/havenCore";

export type Equal<T> = (a: T, b: T) => boolean;

type Stores = { readonly [N in StoreName]: StoreApi<StoreStates[N]> };

/** Listens to every named store; the returned function stops them all. */
export function subscribeStores(
  stores: Stores,
  names: readonly StoreName[],
  listener: () => void,
): () => void {
  const stops = names.map((name) => stores[name].subscribe(listener));
  return () => stops.forEach((stop) => stop());
}

/**
 * The `getSnapshot` for `useSyncExternalStore` over several stores.
 *
 * React requires the same value back while nothing changed, or it renders
 * forever. A selector usually builds a new array or object each call, so the
 * result is kept and handed back again whenever `equal` says the new one is
 * the same. `read` gives the selector and comparison current for this render.
 */
export function cachedSnapshot<N extends StoreName, T>(
  stores: Stores,
  names: readonly N[],
  read: () => {
    select: (states: Pick<StoreStates, N>) => T;
    equal: Equal<T>;
  },
): () => T {
  let last: { value: T } | null = null;
  return () => {
    const { select, equal } = read();
    const states = {} as Pick<StoreStates, N>;
    for (const name of names) {
      (states as Record<N, unknown>)[name] = stores[name].getState();
    }
    const next = select(states);
    if (last && equal(last.value, next)) return last.value;
    last = { value: next };
    return next;
  };
}
