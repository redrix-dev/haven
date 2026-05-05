import { create } from "zustand";
import type { ParsedExpoPushPayload } from "@shared/features/mobile/push/parseExpoPushNotificationData";

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

export function dispatchParsedPayload(
  handlers: MobilePushNavigationHandlers,
  parsed: ParsedExpoPushPayload,
): void {
  switch (parsed.kind) {
    case "dm_message":
      if (parsed.conversationId) {
        handlers.openDm(parsed.conversationId);
      } else {
        handlers.refreshUrgentSurfaces();
      }
      break;
    case "friend_request_received":
      handlers.openFriends({ tab: "requests", highlightedRequestId: parsed.friendRequestId });
      break;
    case "friend_request_accepted":
      handlers.openFriends({ tab: "friends", highlightedRequestId: null });
      break;
    case "channel_mention":
      if (parsed.communityId && parsed.channelId) {
        handlers.openMention(parsed.communityId, parsed.channelId);
      } else {
        handlers.refreshUrgentSurfaces();
      }
      break;
    case "system":
    default:
      handlers.openNotifications();
      break;
  }
}

type MobilePushNavigationState = {
  handlers: MobilePushNavigationHandlers | null;
  setHandlers: (handlers: MobilePushNavigationHandlers | null) => void;
  /** Notification that arrived before handlers were registered; dispatched on next setHandlers call. */
  pendingParsedPayload: ParsedExpoPushPayload | null;
  setPendingParsedPayload: (payload: ParsedExpoPushPayload | null) => void;
};

export const useMobilePushNavigationStore = create<MobilePushNavigationState>()((set, get) => ({
  handlers: null,
  pendingParsedPayload: null,
  setHandlers: (handlers) => {
    set({ handlers });
    if (handlers) {
      const pending = get().pendingParsedPayload;
      if (pending) {
        set({ pendingParsedPayload: null });
        dispatchParsedPayload(handlers, pending);
      }
    }
  },
  setPendingParsedPayload: (payload) => set({ pendingParsedPayload: payload }),
}));
