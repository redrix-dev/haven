import { create } from 'zustand';
import type { NotificationItem } from '@shared/lib/backend/types';


const createDefaultNotificationsState = () => ({
  notifications: [] as NotificationItem[],
  unreadCount: 0,
  isLoading: false,
  isPanelOpen: false,
  inboxRefreshTrigger: 0,
});

export type NotificationsStoreState = {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  isPanelOpen: boolean;
  inboxRefreshTrigger: number;
  setNotifications: (notifications: NotificationItem[]) => void;
  setUnreadCount: (unreadCount: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsPanelOpen: (isPanelOpen: boolean) => void;
  triggerInboxRefresh: () => void;
  reset: () => void;
};

export const useNotificationsStore = create<NotificationsStoreState>()((set) => ({
  ...createDefaultNotificationsState(),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  triggerInboxRefresh: () =>
    set((state) => ({ inboxRefreshTrigger: state.inboxRefreshTrigger + 1 })),
  reset: () => set(createDefaultNotificationsState()),
}));
