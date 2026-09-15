import { create } from "zustand";
import type { HavenLinkIntent } from "@shared/features/links";
import type { ParsedExpoPushPayload } from "@/features/notifications/utils/parseExpoPushNotificationData";

export type MobileFriendsOpenInput = {
  tab: "requests" | "friends";
  highlightedRequestId: string | null;
};

export type MobilePushNavigationHandlers = {
  openDm: (conversationId: string) => void;
  openFriends: (input: MobileFriendsOpenInput) => void;
  openMention: (communityId: string, channelId: string) => void;
  openCommunity: (communityId: string) => void;
  /** Opens the join sheet pre-filled with the code. Joining stays a tap. */
  openInvite: (code: string) => void;
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
      handlers.openFriends({
        tab: "requests",
        highlightedRequestId: parsed.friendRequestId,
      });
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

/** Navigate to where a link points. Links with nowhere to go do nothing. */
export function dispatchLinkIntent(
  handlers: MobilePushNavigationHandlers,
  intent: HavenLinkIntent,
): void {
  switch (intent.kind) {
    case "invite":
      handlers.openInvite(intent.code);
      return;
    case "community":
      handlers.openCommunity(intent.communityId);
      return;
    case "channel":
      handlers.openMention(intent.communityId, intent.channelId);
      return;
    case "dm":
      handlers.openDm(intent.conversationId);
      return;
    case "friends":
      handlers.openFriends({
        tab: intent.tab,
        highlightedRequestId: intent.requestId,
      });
      return;
    case "notifications":
      handlers.openNotifications();
      return;
    case "home":
    case "auth_confirm":
    case "unsupported":
      return;
  }
}

type MobilePushNavigationState = {
  handlers: MobilePushNavigationHandlers | null;
  setHandlers: (handlers: MobilePushNavigationHandlers | null) => void;
  /** Notification that arrived before handlers were registered; dispatched on next setHandlers call. */
  pendingParsedPayload: ParsedExpoPushPayload | null;
  setPendingParsedPayload: (payload: ParsedExpoPushPayload | null) => void;
  /** Link opened before handlers were registered (e.g. right after sign-in); dispatched on next setHandlers call. */
  pendingLinkIntent: HavenLinkIntent | null;
  setPendingLinkIntent: (intent: HavenLinkIntent | null) => void;
};

export const useMobilePushNavigationStore = create<MobilePushNavigationState>()(
  (set, get) => ({
    handlers: null,
    pendingParsedPayload: null,
    pendingLinkIntent: null,
    setHandlers: (handlers) => {
      set({ handlers });
      if (handlers) {
        const pending = get().pendingParsedPayload;
        if (pending) {
          set({ pendingParsedPayload: null });
          dispatchParsedPayload(handlers, pending);
        }
        const pendingLink = get().pendingLinkIntent;
        if (pendingLink) {
          set({ pendingLinkIntent: null });
          dispatchLinkIntent(handlers, pendingLink);
        }
      }
    },
    setPendingParsedPayload: (payload) =>
      set({ pendingParsedPayload: payload }),
    setPendingLinkIntent: (intent) => set({ pendingLinkIntent: intent }),
  }),
);

/** The link pipeline's `open`: navigate now, or as soon as the signed-in shell mounts. */
export function openLinkIntent(intent: HavenLinkIntent): void {
  const { handlers, setPendingLinkIntent } =
    useMobilePushNavigationStore.getState();
  if (!handlers) {
    setPendingLinkIntent(intent);
    return;
  }
  setPendingLinkIntent(null);
  dispatchLinkIntent(handlers, intent);
}
