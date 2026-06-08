import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/nexus/Nexus";
import type { DirectMessageNexusState } from "@shared/nexus/direct-messages/dmTypes";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";

const initialState = (): DirectMessageNexusState => ({
  entities: {},
  conversationIds: [],
  messagesByConversation: {},
  messageEntities: {},
  hasMoreByConversation: {},
  activeConversationId: null,
  isLoadingConversations: false,
  conversationsLastLoadedAt: 0,
  loadingByConversation: {},
  messagesLoadComplete: {},
  messagesLastLoadedAt: {},
  composeDraftPeer: null,
  revision: 0,
});

/** Solid-native DM cache — calls shared selectors, no zustand. */
export class DirectMessageSolidCache {
  readonly state: DirectMessageNexusState;
  readonly reactiveStore: NotifyingReadableStore<DirectMessageNexusState>;
  private readonly setState: (
    updater: (
      state: DirectMessageNexusState,
    ) => Partial<DirectMessageNexusState> | DirectMessageNexusState,
  ) => void;

  constructor() {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  setConversations(conversations: DirectMessageConversationSummary[]): void {
    const entities: Record<string, NexusEntry<DirectMessageConversationSummary>> =
      {};
    const conversationIds: string[] = [];
    for (const conversation of conversations) {
      entities[conversation.conversationId] = {
        data: conversation,
        partial: false,
        cachedAt: Date.now(),
      };
      conversationIds.push(conversation.conversationId);
    }
    this.setState((s) => ({
      entities,
      conversationIds,
      revision: s.revision + 1,
    }));
    this.reactiveStore.notify();
  }

  upsertMessage(message: DirectMessage): void {
    this.setState((s) => {
      const messageEntities = {
        ...s.messageEntities,
        [message.messageId]: message,
      };
      const existing = s.messagesByConversation[message.conversationId] ?? [];
      if (existing.includes(message.messageId)) {
        return { messageEntities, revision: s.revision + 1 };
      }
      const insertAt = existing.findIndex((id) => {
        const entry = s.messageEntities[id];
        return entry != null && entry.createdAt > message.createdAt;
      });
      const next = [...existing];
      if (insertAt === -1) {
        next.push(message.messageId);
      } else {
        next.splice(insertAt, 0, message.messageId);
      }
      return {
        messageEntities,
        messagesByConversation: {
          ...s.messagesByConversation,
          [message.conversationId]: next,
        },
        revision: s.revision + 1,
      };
    });
    this.reactiveStore.notify();
  }
}

export function createDirectMessageSolidCache(): DirectMessageSolidCache {
  return new DirectMessageSolidCache();
}
