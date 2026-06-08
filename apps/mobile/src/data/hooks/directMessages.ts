import type { DirectMessageNexusPort } from "@shared/core/cache/entityNexusPorts";
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
  nexus: DirectMessageNexusPort,
): DirectMessageConversationSummary[] {
  return useStoreSelector(
    nexus.reactiveStore,
    projectConversations,
    conversationsEqual,
  );
}

export function useActiveDmConversationId(
  nexus: DirectMessageNexusPort,
): string | null {
  return useStoreSelector(nexus.reactiveStore, selectActiveConversationId);
}

export function useDmConversationsLoading(nexus: DirectMessageNexusPort): boolean {
  return useStoreSelector(nexus.reactiveStore, selectIsLoadingConversations);
}

export function useDmMessages(
  nexus: DirectMessageNexusPort,
  conversationId: string,
): DirectMessage[] {
  return useStoreSelector(
    nexus.reactiveStore,
    (state) => projectMessages(state, conversationId),
    directMessagesEqual,
  );
}

export function useDmMessagesLoading(
  nexus: DirectMessageNexusPort,
  conversationId: string,
): boolean {
  return useStoreSelector(nexus.reactiveStore, (state) =>
    selectIsLoadingMessages(state, conversationId),
  );
}

export function useDmComposeDraftPeer(
  nexus: DirectMessageNexusPort,
): DmComposeDraftPeer | null {
  return useStoreSelector(nexus.reactiveStore, selectComposeDraftPeer);
}
