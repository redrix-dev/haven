import type { ReadableStore } from "@shared/nexus/storeTypes";

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

const EMPTY_HIDDEN = new Set<string>() as ReadonlySet<string>;

export const createDefaultViewerMessagePolicyState =
  (): ViewerMessagePolicyState => ({
    hiddenAuthorIds: EMPTY_HIDDEN,
    showHiddenMessages: false,
    communities: {},
  });

/** Reactive store handle — implementation lives in platform data layers. */
export type ViewerMessagePolicyStore =
  ReadableStore<ViewerMessagePolicyState> & {
    setState: (
      partial:
        | Partial<ViewerMessagePolicyState>
        | ((
            state: ViewerMessagePolicyState,
          ) => Partial<ViewerMessagePolicyState>),
    ) => void;
  };

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

const revokedByChannelEqual = (
  a: Readonly<Record<string, readonly string[]>>,
  b: Readonly<Record<string, readonly string[]>>,
): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
};

export const viewerCommunityPolicyEqual = (
  a: ViewerMessagePolicyState["communities"][string] | undefined,
  b: ViewerMessagePolicyState["communities"][string] | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.suppressAuthorFilter === b.suppressAuthorFilter &&
    a.canViewBanHidden === b.canViewBanHidden &&
    revokedByChannelEqual(
      a.revokedAuthorIdsByChannel,
      b.revokedAuthorIdsByChannel,
    )
  );
};

/** Stable selector equality for policy store subscriptions. */
export const viewerPolicyHiddenAuthorIdsEqual = hiddenAuthorIdsEqual;
