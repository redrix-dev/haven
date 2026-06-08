import type { Accessor } from "solid-js";
import type {
  DirectMessageNexus,
  DmComposeDraftPeer,
} from "@shared/nexus/direct-messages/DirectMessageNexus";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import {
  conversationsEqual,
  directMessagesEqual,
  projectConversations,
  projectMessages,
  selectActiveConversationId,
  selectComposeDraftPeer,
  selectIsLoadingConversations,
  selectIsLoadingMessages,
} from "@shared/nexus/direct-messages/dmSelectors";
import { createStoreSelector } from "./fromStore";

/**
 * Solid bindings for DirectMessageNexus — mirror of `@react-bindings/directMessages`.
 * Conversation-id args arrive as getters so Solid tracks them at access time.
 */

export function createDmConversations(
  nexus: DirectMessageNexus,
): Accessor<DirectMessageConversationSummary[]> {
  return createStoreSelector(
    nexus.reactiveStore,
    projectConversations,
    conversationsEqual,
  );
}

export function createActiveDmConversationId(
  nexus: DirectMessageNexus,
): Accessor<string | null> {
  return createStoreSelector(nexus.reactiveStore, selectActiveConversationId);
}

export function createDmConversationsLoading(
  nexus: DirectMessageNexus,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, selectIsLoadingConversations);
}

export function createDmMessages(
  nexus: DirectMessageNexus,
  conversationId: Accessor<string>,
): Accessor<DirectMessage[]> {
  return createStoreSelector(
    nexus.reactiveStore,
    (state) => projectMessages(state, conversationId()),
    directMessagesEqual,
  );
}

export function createDmMessagesLoading(
  nexus: DirectMessageNexus,
  conversationId: Accessor<string>,
): Accessor<boolean> {
  return createStoreSelector(nexus.reactiveStore, (state) =>
    selectIsLoadingMessages(state, conversationId()),
  );
}

export function createDmComposeDraftPeer(
  nexus: DirectMessageNexus,
): Accessor<DmComposeDraftPeer | null> {
  return createStoreSelector(nexus.reactiveStore, selectComposeDraftPeer);
}
