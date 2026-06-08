import type { Accessor } from "solid-js";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import {
  conversationsEqual,
  directMessagesEqual,
  projectConversations,
  projectMessages,
} from "@shared/nexus/direct-messages/dmSelectors";
import { createStoreSelector } from "../fromStore";
import type { DirectMessageSolidCache } from "./dmSolidCache";

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
