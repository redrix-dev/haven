import { create } from 'zustand';
import type { NotificationItem } from '@shared/lib/backend/types';

const createDefaultNotificationsState = () => ({
  notifications: [] as NotificationItem[],
  unreadCount: 0,
  isLoading: false,
});

export type NotificationsStoreState = {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  setNotifications: (notifications: NotificationItem[]) => void;
  setUnreadCount: (unreadCount: number) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
};

export const useNotificationsStore = create<NotificationsStoreState>()((set) => ({
  ...createDefaultNotificationsState(),
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(createDefaultNotificationsState()),
}));
