import { createStore } from "solid-js/store";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyState,
  type ViewerMessagePolicyStore,
} from "@shared/core/viewerMessagePolicy";

/**
 * Solid-native viewer-message-policy store.
 *
 * It satisfies the shared `ViewerMessagePolicyStore` contract (so the
 * cross-platform message logic and mobile share one type), but reactivity is
 * pure Solid: `getState()` returns the live store proxy and the message nexus
 * reads it inside a `createMemo`, so a `setState` wakes exactly those readers.
 * `subscribe` exists only to satisfy the shared ReadableStore type — the Solid
 * side never calls it (no notify, no manual pub/sub).
 */
export function createSolidViewerMessagePolicyStore(): ViewerMessagePolicyStore {
  const [state, setState] = createStore(
    createDefaultViewerMessagePolicyState(),
  );

  return {
    getState: () => state,
    getInitialState: () => state,
    subscribe: () => () => {},
    setState: (partial) =>
      setState(typeof partial === "function" ? partial(state) : partial),
  };
}

export type { ViewerMessagePolicyState };
