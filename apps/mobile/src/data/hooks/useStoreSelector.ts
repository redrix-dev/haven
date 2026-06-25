import { useStoreWithEqualityFn } from "zustand/traditional";
import type { ReadableStore } from "@shared/nexus/storeTypes";

/** Generic React adapter over a framework-agnostic vanilla zustand store. */
export function useStoreSelector<S, T>(
  store: ReadableStore<S>,
  selector: (state: S) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
