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
  const policyStore = cache.viewerMessagePolicyStore;
  const communityId = cache.communityId;

  const hiddenAuthorIds = policyStore
    ? useStoreSelector(
        policyStore,
        (state) => state.hiddenAuthorIds,
        viewerPolicyHiddenAuthorIdsEqual,
      )
    : null;
  const showHiddenMessages = policyStore
    ? useStoreSelector(policyStore, (state) => state.showHiddenMessages)
    : false;
  const communityPolicy = policyStore
    ? useStoreSelector(
        policyStore,
        (state) => state.communities[communityId],
        viewerCommunityPolicyEqual,
      )
    : undefined;

  return useMemo(() => {
    if (!policyStore) {
      return projectVisibleChannelMessagesBlockOnly(raw, new Set<string>());
    }
    const policy = {
      hiddenAuthorIds: hiddenAuthorIds ?? new Set<string>(),
      showHiddenMessages,
      communities: communityPolicy
        ? { [communityId]: communityPolicy }
        : {},
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
  }, [raw, hiddenAuthorIds, showHiddenMessages, communityPolicy, channelId, communityId, policyStore]);
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
