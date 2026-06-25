import { create } from "zustand";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyState,
  type ViewerMessagePolicyStore,
} from "@shared/core";

export function createTestViewerMessagePolicyStore(): ViewerMessagePolicyStore {
  return create<ViewerMessagePolicyState>()(() =>
    createDefaultViewerMessagePolicyState(),
  );
}
