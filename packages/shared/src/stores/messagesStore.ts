import { create } from 'zustand';
import type {
  AuthorProfile,
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from '@shared/lib/backend/types';

const createRecordById = <T extends { id: string }>(items: T[]): Record<string, T> =>
  items.reduce<Record<string, T>>((next, item) => {
    next[item.id] = item;
    return next;
  }, {});

const createDefaultMessagesState = () => ({
  messages: [] as Message[],
  reactions: {} as Record<string, MessageReaction>,
  attachments: {} as Record<string, MessageAttachment>,
  linkPreviews: {} as Record<string, MessageLinkPreview>,
  profiles: {} as Record<string, AuthorProfile>,
  isLoading: false,
  hasMore: false,
});

export type MessagesStoreState = {
  messages: Message[];
  reactions: Record<string, MessageReaction>;
  attachments: Record<string, MessageAttachment>;
  linkPreviews: Record<string, MessageLinkPreview>;
  profiles: Record<string, AuthorProfile>;
  isLoading: boolean;
  hasMore: boolean;
  setMessages: (messages: Message[]) => void;
  setReactions: (reactions: MessageReaction[]) => void;
  setAttachments: (attachments: MessageAttachment[]) => void;
  setLinkPreviews: (linkPreviews: MessageLinkPreview[]) => void;
  setProfiles: (profiles: Record<string, AuthorProfile>) => void;
  setIsLoading: (isLoading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  reset: () => void;
};

export const useMessagesStore = create<MessagesStoreState>()((set) => ({
  ...createDefaultMessagesState(),
  setMessages: (messages) => set({ messages }),
  setReactions: (reactions) => set({ reactions: createRecordById(reactions) }),
  setAttachments: (attachments) => set({ attachments: createRecordById(attachments) }),
  setLinkPreviews: (linkPreviews) => set({ linkPreviews: createRecordById(linkPreviews) }),
  setProfiles: (profiles) => set({ profiles }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  reset: () => set(createDefaultMessagesState()),
}));
