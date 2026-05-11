import { create } from "zustand";
import {
  uxLabChannels,
  uxLabCommunities,
  uxLabNotifications,
} from "./UxLabData";
import type { UxLabMessage, UxLabSurface } from "./UxLabTypes";

type UxLabOpenSheet =
  | "community-switcher"
  | "channel-switcher"
  | "quick-actions"
  | null;

type UxLabState = {
  activeSurface: UxLabSurface;
  activeCommunityId: string;
  activeChannelId: string;
  activeDmThreadId: string | null;
  composerDraft: string;
  sentMessages: UxLabMessage[];
  openSheet: UxLabOpenSheet;
  readNotificationIds: string[];
  setActiveSurface: (surface: UxLabSurface) => void;
  selectCommunity: (communityId: string) => void;
  selectChannel: (channelId: string) => void;
  selectDmThread: (threadId: string) => void;
  setComposerDraft: (draft: string) => void;
  sendComposerDraft: () => void;
  setOpenSheet: (sheet: UxLabOpenSheet) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
};

const firstCommunity = uxLabCommunities[0];
const firstChannel = uxLabChannels.find(
  (channel) => channel.communityId === firstCommunity.id,
);

export const useUxLabStore = create<UxLabState>((set, get) => ({
  activeSurface: "home",
  activeCommunityId: firstCommunity.id,
  activeChannelId: firstChannel?.id ?? uxLabChannels[0].id,
  activeDmThreadId: null,
  composerDraft: "",
  sentMessages: [],
  openSheet: null,
  readNotificationIds: uxLabNotifications
    .filter((notification) => !notification.unread)
    .map((notification) => notification.id),
  setActiveSurface: (activeSurface) => set({ activeSurface }),
  selectCommunity: (communityId) => {
    const nextChannel =
      uxLabChannels.find((channel) => channel.communityId === communityId) ??
      uxLabChannels[0];
    set({
      activeCommunityId: communityId,
      activeChannelId: nextChannel.id,
      activeSurface: "community",
      openSheet: null,
    });
  },
  selectChannel: (activeChannelId) =>
    set({ activeChannelId, activeSurface: "community", openSheet: null }),
  selectDmThread: (activeDmThreadId) =>
    set({ activeDmThreadId, activeSurface: "dms" }),
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  sendComposerDraft: () => {
    const state = get();
    const body = state.composerDraft.trim();
    if (!body) return;
    set({
      composerDraft: "",
      sentMessages: [
        ...state.sentMessages,
        {
          id: `sent-${Date.now()}`,
          channelId: state.activeChannelId,
          author: "You",
          body,
          timestamp: "now",
        },
      ],
    });
  },
  setOpenSheet: (openSheet) => set({ openSheet }),
  markNotificationRead: (notificationId) =>
    set((state) => ({
      readNotificationIds: state.readNotificationIds.includes(notificationId)
        ? state.readNotificationIds
        : [...state.readNotificationIds, notificationId],
    })),
  markAllNotificationsRead: () =>
    set({
      readNotificationIds: uxLabNotifications.map(
        (notification) => notification.id,
      ),
    }),
}));
