import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StoreApi } from "zustand/vanilla";

/**
 * Generic React adapter over a framework-agnostic vanilla zustand store.
 *
 * The shared core (post-3b) owns the store via `zustand/vanilla createStore` and
 * exposes only `getState`/`subscribe`/actions — no React. This hook is the React
 * binding; per-domain hooks (`useProfile`, `useVoiceSession`, …) are thin wrappers
 * over it. Consumed by web-client (web/electron) and apps/mobile (RN).
 *
 * Mirrors the equality-fn behavior the old in-class `use*` selectors used
 * (`useStoreWithEqualityFn(store, selector, Object.is)`), so relocated selectors
 * behave identically.
 */
export function useStoreSelector<S, T>(
  store: StoreApi<S>,
  selector: (state: S) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
