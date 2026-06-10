import { createStore } from "solid-js/store";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyState,
  type ViewerMessagePolicyStore,
} from "@shared/core/viewerMessagePolicy";
import { wireSolidReadableStore } from "../solidReadableStore";

export function createSolidViewerMessagePolicyStore(): ViewerMessagePolicyStore {
  const [state, setState] = createStore(
    createDefaultViewerMessagePolicyState(),
  );
  const readable = wireSolidReadableStore(state);

  return {
    getState: () => readable.getState(),
    getInitialState: () => readable.getInitialState(),
    subscribe: readable.subscribe,
    setState: (partial) => {
      if (typeof partial === "function") {
        setState(partial(state));
      } else {
        setState(partial);
      }
      readable.notify();
    },
  };
}

export type { ViewerMessagePolicyState };
