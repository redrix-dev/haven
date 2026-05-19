import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";

/** v1: block visibility only. v2 expands via community-keyed buckets. */
export type ViewerMessagePolicyState = {
  hiddenAuthorIds: ReadonlySet<string>;
  showHiddenMessages: boolean;
  communities: Readonly<
    Record<
      string,
      {
        suppressAuthorFilter: boolean;
        canViewBanHidden: boolean;
        revokedAuthorIdsByChannel: Readonly<Record<string, readonly string[]>>;
      }
    >
  >;
};

export type ViewerMessagePolicyStore = UseBoundStore<
  StoreApi<ViewerMessagePolicyState>
>;

const EMPTY_HIDDEN = new Set<string>() as ReadonlySet<string>;

export const createDefaultViewerMessagePolicyState =
  (): ViewerMessagePolicyState => ({
    hiddenAuthorIds: EMPTY_HIDDEN,
    showHiddenMessages: false,
    communities: {},
  });

export function createViewerMessagePolicyStore(): ViewerMessagePolicyStore {
  return create<ViewerMessagePolicyState>()(() =>
    createDefaultViewerMessagePolicyState(),
  );
}

const hiddenAuthorIdsEqual = (
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
};

/** Stable selector equality for policy store subscriptions. */
export const viewerPolicyHiddenAuthorIdsEqual = hiddenAuthorIdsEqual;
