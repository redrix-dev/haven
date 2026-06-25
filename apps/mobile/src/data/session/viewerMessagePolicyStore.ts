import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import {
  createDefaultViewerMessagePolicyState,
  type ViewerMessagePolicyState,
} from "@shared/core/viewerMessagePolicy";

export type ViewerMessagePolicyStore = UseBoundStore<
  StoreApi<ViewerMessagePolicyState>
>;

export {
  createDefaultViewerMessagePolicyState,
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
} from "@shared/core/viewerMessagePolicy";
export type { ViewerMessagePolicyState } from "@shared/core/viewerMessagePolicy";

export function createMobileViewerMessagePolicyStore(): ViewerMessagePolicyStore {
  return create<ViewerMessagePolicyState>()(() =>
    createDefaultViewerMessagePolicyState(),
  );
}
