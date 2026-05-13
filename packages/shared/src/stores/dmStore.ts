import { create } from 'zustand';
import type { DirectMessageConversationSummary } from '@shared/lib/backend/types';

export type DmMessageRefreshTrigger = {
  conversationId: string;
  tick: number;
};

const createDefaultDmState = () => ({
  conversations: [] as DirectMessageConversationSummary[],
  currentConversationId: null as string | null,
  currentConversation: null as DirectMessageConversationSummary | null,
  unreadCounts: {} as Record<string, number>,
  isLoading: false,
  dmConversationsRefreshTrigger: 0,
  dmMessageRefreshTrigger: null as DmMessageRefreshTrigger | null,
});

export type DmStoreState = {
  conversations: DirectMessageConversationSummary[];
  currentConversationId: string | null;
  currentConversation: DirectMessageConversationSummary | null;
  unreadCounts: Record<string, number>;
  isLoading: boolean;
  dmConversationsRefreshTrigger: number;
  dmMessageRefreshTrigger: DmMessageRefreshTrigger | null;
  setConversations: (conversations: DirectMessageConversationSummary[]) => void;
  setCurrentConversationId: (currentConversationId: string | null) => void;
  setCurrentConversation: (currentConversation: DirectMessageConversationSummary | null) => void;
  setUnreadCounts: (unreadCounts: Record<string, number>) => void;
  setIsLoading: (isLoading: boolean) => void;
  triggerConversationsRefresh: () => void;
  triggerMessageRefresh: (conversationId: string) => void;
  reset: () => void;
};

export const useDmStore = create<DmStoreState>()((set) => ({
  ...createDefaultDmState(),
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),
  setIsLoading: (isLoading) => set({ isLoading }),
  triggerConversationsRefresh: () =>
    set((state) => ({
      dmConversationsRefreshTrigger: state.dmConversationsRefreshTrigger + 1,
    })),
  triggerMessageRefresh: (conversationId) =>
    set((state) => ({
      dmMessageRefreshTrigger: {
        conversationId,
        tick: (state.dmMessageRefreshTrigger?.tick ?? 0) + 1,
      },
    })),
  reset: () => set(createDefaultDmState()),
}));
