import { create } from 'zustand';
import type { MessageBundle } from '@shared/lib/backend/types';

const createDefaultMessagesState = () => ({
  messages: [] as MessageBundle[],
  isLoading: false,
  hasMore: false,
});

export type MessagesStoreState = {
  messages: MessageBundle[];
  isLoading: boolean;
  hasMore: boolean;
  setMessages: (messages: MessageBundle[]) => void;
  updateMessageBundle: (id: string, updater: (bundle: MessageBundle) => MessageBundle) => void;
  setIsLoading: (isLoading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  reset: () => void;
};

export const useMessagesStore = create<MessagesStoreState>()((set) => ({
  ...createDefaultMessagesState(),
  setMessages: (messages) => set({ messages }),
  updateMessageBundle: (id, updater) =>
    set((state) => ({
      messages: state.messages.map((bundle) => (bundle.id === id ? updater(bundle) : bundle)),
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  reset: () => set(createDefaultMessagesState()),
}));
