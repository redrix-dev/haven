import { useMemo } from "react";
import type { CommunityMessageCache } from "../messages/CommunityMessageCache";
import type { MessageBundle } from "@shared/lib/backend/types";
import {
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
} from "@shared/core/viewerMessagePolicy";
import {
  channelMetaEqual,
  messagesEqual,
  type ChannelMeta,
} from "@shared/features/messaging/logic";
import {
  projectVisibleChannelMessages,
  projectVisibleChannelMessagesBlockOnly,
} from "@shared/nexus/community/projectVisibleChannelMessages";
import { useStoreSelector } from "./useStoreSelector";
import { createMobileViewerMessagePolicyStore } from "../session/viewerMessagePolicyStore";

/**
 * Stable sentinel for caches that have no viewer-policy store. The policy hooks
 * in useVisibleChannel must run unconditionally (rules-of-hooks), so a null
 * store falls back to this constant empty one. Its default state ("nothing
 * hidden") yields exactly the projection the old null-branch produced, and its
 * identity never changes, so it never triggers a re-subscribe.
 */
const EMPTY_VIEWER_POLICY_STORE = createMobileViewerMessagePolicyStore();

export function useChannel(
  cache: CommunityMessageCache,
  channelId: string,
): MessageBundle[] {
  return useStoreSelector(
    cache.reactiveStore,
    cache.getChannelStateSelector(channelId),
    messagesEqual,
  );
}

export function useVisibleChannel(
  cache: CommunityMessageCache,
  channelId: string,
): MessageBundle[] {
  const raw = useChannel(cache, channelId);
  const communityId = cache.communityId;
  // Fall back to the stable empty sentinel so the policy hooks always run in the
  // same order, regardless of which cache instance this is (rules-of-hooks).
  const policyStore =
    cache.viewerMessagePolicyStore ?? EMPTY_VIEWER_POLICY_STORE;

  const hiddenAuthorIds = useStoreSelector(
    policyStore,
    (state) => state.hiddenAuthorIds,
    viewerPolicyHiddenAuthorIdsEqual,
  );
  const showHiddenMessages = useStoreSelector(
    policyStore,
    (state) => state.showHiddenMessages,
  );
  const communityPolicy = useStoreSelector(
    policyStore,
    (state) => state.communities[communityId],
    viewerCommunityPolicyEqual,
  );

  return useMemo(() => {
    const policy = {
      hiddenAuthorIds,
      showHiddenMessages,
      communities: communityPolicy ? { [communityId]: communityPolicy } : {},
    };
    if (Object.keys(policy.communities).length === 0) {
      return projectVisibleChannelMessagesBlockOnly(
        raw,
        policy.hiddenAuthorIds,
      );
    }
    return projectVisibleChannelMessages(raw, policy, {
      communityId,
      channelId,
    });
  }, [
    raw,
    hiddenAuthorIds,
    showHiddenMessages,
    communityPolicy,
    channelId,
    communityId,
  ]);
}

export function useChannelMeta(
  cache: CommunityMessageCache,
  channelId: string,
): ChannelMeta {
  return useStoreSelector(
    cache.reactiveStore,
    cache.getChannelMetaSelector(channelId),
    channelMetaEqual,
  );
}

export function useIsLoadingInitial(
  cache: CommunityMessageCache,
  channelId: string,
): boolean {
  return useStoreSelector(
    cache.reactiveStore,
    (state) => state.loadingInitial[channelId] ?? false,
  );
}

export function useIsLoadingOlder(
  cache: CommunityMessageCache,
  channelId: string,
): boolean {
  return useStoreSelector(
    cache.reactiveStore,
    (state) => state.loadingOlder[channelId] ?? false,
  );
}

export function useHasInitialLoadCompleted(
  cache: CommunityMessageCache,
  channelId: string,
): boolean {
  return useStoreSelector(
    cache.reactiveStore,
    (state) => state.initialLoadComplete[channelId] ?? false,
  );
}
