import { createMemo, type Accessor } from "solid-js";
import type { MessageBundle } from "@shared/lib/backend/types";
import {
  viewerCommunityPolicyEqual,
  viewerPolicyHiddenAuthorIdsEqual,
  type ViewerMessagePolicyStore,
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
import { createStoreSelector } from "../fromStore";
import type { CommunityMessageSolidCache } from "./communityMessageSolidCache";

// Accessor rules: data/README.md. Mirrors mobile's hooks
// (apps/mobile/src/data/hooks/messages.ts) — same shared selectors, same
// equality functions, Solid accessors instead of React hooks.

/** Raw channel messages, ascending by createdAt — no viewer policy applied. */
export function createChannelMessages(
  cache: CommunityMessageSolidCache,
  channelId: Accessor<string>,
): Accessor<MessageBundle[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => {
      const ids = state.byChannel[channelId()] ?? [];
      const bundles: MessageBundle[] = [];
      for (const id of ids) {
        const entry = state.entities[id];
        if (entry) bundles.push(entry.data);
      }
      return bundles;
    },
    messagesEqual,
  );
}

/**
 * Channel messages with the viewer's message policy applied (blocks, ban
 * hides, revoked authors) — the projection screens read.
 */
export function createVisibleChannelMessages(
  cache: CommunityMessageSolidCache,
  policyStore: ViewerMessagePolicyStore,
  channelId: Accessor<string>,
): Accessor<MessageBundle[]> {
  const raw = createChannelMessages(cache, channelId);

  const hiddenAuthorIds = createStoreSelector(
    policyStore,
    (state) => state.hiddenAuthorIds,
    viewerPolicyHiddenAuthorIdsEqual,
  );
  const showHiddenMessages = createStoreSelector(
    policyStore,
    (state) => state.showHiddenMessages,
  );
  const communityPolicy = createStoreSelector(
    policyStore,
    (state) => state.communities[cache.communityId],
    viewerCommunityPolicyEqual,
  );

  return createMemo(() => {
    const policy = communityPolicy();
    if (!policy) {
      return projectVisibleChannelMessagesBlockOnly(raw(), hiddenAuthorIds());
    }
    return projectVisibleChannelMessages(
      raw(),
      {
        hiddenAuthorIds: hiddenAuthorIds(),
        showHiddenMessages: showHiddenMessages(),
        communities: { [cache.communityId]: policy },
      },
      { communityId: cache.communityId, channelId: channelId() },
    );
  });
}

export function createChannelMeta(
  cache: CommunityMessageSolidCache,
  channelId: Accessor<string>,
): Accessor<ChannelMeta> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => ({
      hasMore: state.hasMore[channelId()] ?? false,
      cursor: state.cursors[channelId()] ?? null,
    }),
    channelMetaEqual,
  );
}

export function createIsLoadingOlder(
  cache: CommunityMessageSolidCache,
  channelId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => state.loadingOlder[channelId()] ?? false,
  );
}

export function createHasInitialLoadCompleted(
  cache: CommunityMessageSolidCache,
  channelId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => state.initialLoadComplete[channelId()] ?? false,
  );
}
