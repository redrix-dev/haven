import type { DirectMessageNexus } from "../direct-messages/DirectMessageNexus";
import type { DmComposeDraftPeer } from "@shared/nexus/direct-messages/dmTypes";
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
import { useStoreSelector } from "./useStoreSelector";

export function useDmConversations(
  nexus: DirectMessageNexus,
): DirectMessageConversationSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectConversations,
    conversationsEqual,
  );
}

export function useActiveDmConversationId(
  nexus: DirectMessageNexus,
): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveConversationId);
}

export function useDmConversationsLoading(nexus: DirectMessageNexus): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoadingConversations);
}

export function useDmMessages(
  nexus: DirectMessageNexus,
  conversationId: string,
): DirectMessage[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => projectMessages(state, conversationId),
    directMessagesEqual,
  );
}

export function useDmMessagesLoading(
  nexus: DirectMessageNexus,
  conversationId: string,
): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    selectIsLoadingMessages(state, conversationId),
  );
}

export function useDmComposeDraftPeer(
  nexus: DirectMessageNexus,
): DmComposeDraftPeer | null {
  return useStoreSelector(nexus.reactiveStore, selectComposeDraftPeer);
}
