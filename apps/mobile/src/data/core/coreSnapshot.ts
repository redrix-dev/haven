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
 * forever. A selector usually builds a new array or object each call, and
 * `equal` can't always tell two of them are the same (rows built fresh are
 * never shallow-equal). So while the selector and every store it reads are
 * the ones it last ran on, it doesn't run: the last value comes back. When
 * something did change, a result `equal` to the last keeps the last.
 * `read` gives the selector and comparison current for this render.
 */
export function cachedSnapshot<N extends StoreName, T>(
  stores: Stores,
  names: readonly N[],
  read: () => {
    select: (states: Pick<StoreStates, N>) => T;
    equal: Equal<T>;
  },
): () => T {
  let last: {
    value: T;
    select: unknown;
    states: unknown[];
  } | null = null;
  return () => {
    const { select, equal } = read();
    const current = names.map((name) => stores[name].getState());
    if (
      last &&
      last.select === select &&
      current.every((state, i) => state === last!.states[i])
    ) {
      return last.value;
    }
    const states = {} as Pick<StoreStates, N>;
    names.forEach((name, i) => {
      (states as Record<N, unknown>)[name] = current[i];
    });
    const next = select(states);
    const value = last && equal(last.value, next) ? last.value : next;
    last = { value, select, states: current };
    return value;
  };
}
