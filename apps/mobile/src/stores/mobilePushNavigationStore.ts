import { create } from "zustand";

export type MobileFriendsOpenInput = {
  tab: "requests" | "friends";
  highlightedRequestId: string | null;
};

export type MobilePushNavigationHandlers = {
  openDm: (conversationId: string) => void;
  openFriends: (input: MobileFriendsOpenInput) => void;
  openMention: (communityId: string, channelId: string) => void;
  openNotifications: () => void;
  /** Refresh DM list, social counts, notification inbox when urgent push arrives in foreground. */
  refreshUrgentSurfaces: () => void;
};

type MobilePushNavigationState = {
  handlers: MobilePushNavigationHandlers | null;
  setHandlers: (handlers: MobilePushNavigationHandlers | null) => void;
};

export const useMobilePushNavigationStore = create<MobilePushNavigationState>()((set) => ({
  handlers: null,
  setHandlers: (handlers) => set({ handlers }),
}));
