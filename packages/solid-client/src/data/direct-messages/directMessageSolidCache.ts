import { createStore } from "solid-js/store";
import { wireSolidReadableStore, type NotifyingReadableStore } from "../solidReadableStore";
import type { NexusEntry } from "@shared/core/cache/entityTypes";
import type { DirectMessageNexusState } from "@shared/nexus/direct-messages/dmTypes";
import type { DirectMessageBackend } from "@shared/lib/backend/directMessageBackend";
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
  private conversationsInflight: Promise<void> | null = null;

  constructor(private readonly backend: DirectMessageBackend) {
    const [state, setState] = createStore(initialState());
    this.state = state;
    this.setState = setState as typeof this.setState;
    this.reactiveStore = wireSolidReadableStore(state);
  }

  async loadConversations(): Promise<void> {
    if (this.conversationsInflight) return this.conversationsInflight;

    this.conversationsInflight = (async () => {
      this.setState((s) => ({
        isLoadingConversations: true,
        revision: s.revision + 1,
      }));
      this.reactiveStore.notify();
      try {
        const conversations = await this.backend.listConversations();
        this.setConversations(conversations);
        this.setState((s) => ({
          conversationsLastLoadedAt: Date.now(),
          isLoadingConversations: false,
          revision: s.revision + 1,
        }));
        this.reactiveStore.notify();
      } catch (error) {
        this.setState((s) => ({
          isLoadingConversations: false,
          revision: s.revision + 1,
        }));
        this.reactiveStore.notify();
        throw error;
      }
    })().finally(() => {
      this.conversationsInflight = null;
    });

    return this.conversationsInflight;
  }

  async ensureConversationsLoaded(
    options?: { freshnessMs?: number },
  ): Promise<void> {
    if (this.conversationsInflight) return this.conversationsInflight;
    const freshnessMs = options?.freshnessMs ?? 60_000;
    if (
      this.state.conversationsLastLoadedAt > 0 &&
      Date.now() - this.state.conversationsLastLoadedAt < freshnessMs
    ) {
      return;
    }
    await this.loadConversations();
  }

  async receiveMessage(conversationId: string, messageId: string): Promise<void> {
    const message = await this.backend.getMessage({ conversationId, messageId });
    if (message) {
      this.upsertMessage(message);
    }
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

  rehydrate(): void {}

  clear(): void {
    this.setState(() => initialState());
    this.reactiveStore.notify();
  }
}

export function createDirectMessageSolidCache(
  backend: DirectMessageBackend,
): DirectMessageSolidCache {
  return new DirectMessageSolidCache(backend);
}
