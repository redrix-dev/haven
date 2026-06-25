import type { DirectMessageNexusState } from "./dmTypes";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";

/**
 * Pure, framework-agnostic projections + equality fns for the DM store.
 * Single source of truth for "which slice + how to compare", consumed by both
 * `@mobile-data/hooks` and `@solid-client/data` accessors. Memoization lives in the adapters.
 */

const EMPTY_CONVERSATIONS: DirectMessageConversationSummary[] = [];
const EMPTY_MESSAGES: DirectMessage[] = [];

export const projectConversations = (
  state: DirectMessageNexusState,
): DirectMessageConversationSummary[] => {
  if (state.conversationIds.length === 0) return EMPTY_CONVERSATIONS;
  return state.conversationIds
    .map((id) => state.entities[id]?.data)
    .filter((c): c is DirectMessageConversationSummary => c !== undefined);
};

export const projectMessages = (
  state: DirectMessageNexusState,
  conversationId: string,
): DirectMessage[] => {
  const ids = state.messagesByConversation[conversationId] ?? [];
  if (ids.length === 0) return EMPTY_MESSAGES;
  const list: DirectMessage[] = [];
  for (const id of ids) {
    const msg = state.messageEntities[id];
    if (msg) list.push(msg);
  }
  return list;
};

export const selectActiveConversationId = (
  state: DirectMessageNexusState,
): string | null => state.activeConversationId;

export const selectIsLoadingConversations = (
  state: DirectMessageNexusState,
): boolean => state.isLoadingConversations;

export const selectComposeDraftPeer = (state: DirectMessageNexusState) =>
  state.composeDraftPeer;

export const selectIsLoadingMessages = (
  state: DirectMessageNexusState,
  conversationId: string,
): boolean => state.loadingByConversation[conversationId] ?? false;

export const conversationsEqual = (
  a: DirectMessageConversationSummary[],
  b: DirectMessageConversationSummary[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].conversationId !== b[i].conversationId ||
      a[i].otherUserId !== b[i].otherUserId ||
      a[i].otherUsername !== b[i].otherUsername ||
      a[i].otherAvatarUrl !== b[i].otherAvatarUrl ||
      a[i].updatedAt !== b[i].updatedAt ||
      a[i].lastMessageAt !== b[i].lastMessageAt ||
      a[i].lastMessageId !== b[i].lastMessageId ||
      a[i].lastMessageAuthorUserId !== b[i].lastMessageAuthorUserId ||
      a[i].lastMessagePreview !== b[i].lastMessagePreview ||
      a[i].lastMessageCreatedAt !== b[i].lastMessageCreatedAt ||
      a[i].unreadCount !== b[i].unreadCount ||
      a[i].isMuted !== b[i].isMuted ||
      a[i].mutedUntil !== b[i].mutedUntil
    ) {
      return false;
    }
  }
  return true;
};

export const directMessagesEqual = (
  a: DirectMessage[],
  b: DirectMessage[],
): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
