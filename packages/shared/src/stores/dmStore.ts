import { create } from 'zustand';
import type { DirectMessageConversationSummary } from '@shared/lib/backend/types';

const createDefaultDmState = () => ({
  conversations: [] as DirectMessageConversationSummary[],
  currentConversationId: null as string | null,
  currentConversation: null as DirectMessageConversationSummary | null,
  unreadCounts: {} as Record<string, number>,
  isLoading: false,
});

export type DmStoreState = {
  conversations: DirectMessageConversationSummary[];
  currentConversationId: string | null;
  currentConversation: DirectMessageConversationSummary | null;
  unreadCounts: Record<string, number>;
  isLoading: boolean;
  setConversations: (conversations: DirectMessageConversationSummary[]) => void;
  setCurrentConversationId: (currentConversationId: string | null) => void;
  setCurrentConversation: (currentConversation: DirectMessageConversationSummary | null) => void;
  setUnreadCounts: (unreadCounts: Record<string, number>) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
};

export const useDmStore = create<DmStoreState>()((set) => ({
  ...createDefaultDmState(),
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(createDefaultDmState()),
}));
