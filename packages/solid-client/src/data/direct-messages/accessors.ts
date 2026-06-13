import type { Accessor } from "solid-js";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import {
  selectActiveConversationId,
  selectComposeDraftPeer,
  selectIsLoadingConversations,
  selectIsLoadingMessages,
  conversationsEqual,
  directMessagesEqual,
  projectConversations,
  projectMessages,
} from "@shared/nexus/direct-messages/dmSelectors";
import type { DmComposeDraftPeer } from "@shared/nexus/direct-messages/dmTypes";
import { createStoreSelector } from "../fromStore";
import type { DirectMessageSolidCache } from "./directMessageSolidCache";

export function createDmConversations(
  cache: DirectMessageSolidCache,
): Accessor<DirectMessageConversationSummary[]> {
  return createStoreSelector(
    cache.reactiveStore,
    projectConversations,
    conversationsEqual,
  );
}

export function createDmMessages(
  cache: DirectMessageSolidCache,
  conversationId: Accessor<string>,
): Accessor<DirectMessage[]> {
  return createStoreSelector(
    cache.reactiveStore,
    (state) => projectMessages(state, conversationId()),
    directMessagesEqual,
  );
}

export function createActiveDmConversationId(
  cache: DirectMessageSolidCache,
): Accessor<string | null> {
  return createStoreSelector(cache.reactiveStore, selectActiveConversationId);
}

export function createDmConversationsLoading(
  cache: DirectMessageSolidCache,
): Accessor<boolean> {
  return createStoreSelector(cache.reactiveStore, selectIsLoadingConversations);
}

export function createDmMessagesLoading(
  cache: DirectMessageSolidCache,
  conversationId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(cache.reactiveStore, (state) =>
    selectIsLoadingMessages(state, conversationId()),
  );
}

export function createDmComposeDraftPeer(
  cache: DirectMessageSolidCache,
): Accessor<DmComposeDraftPeer | null> {
  return createStoreSelector(cache.reactiveStore, selectComposeDraftPeer);
}
