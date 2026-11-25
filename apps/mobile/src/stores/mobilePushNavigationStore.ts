import { create } from "zustand";
import type { HavenLinkIntent } from "@shared/features/links";

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
  /** Shows who a friend link is from and asks; nothing is accepted by opening it. */
  openFriendLink: (code: string) => void;
  openNotifications: () => void;
};

/** Navigate to where a link points. Links with nowhere to go do nothing. */
export function dispatchLinkIntent(
  handlers: MobilePushNavigationHandlers,
  intent: HavenLinkIntent,
): void {
  switch (intent.kind) {
    case "invite":
      handlers.openInvite(intent.code);
      return;
    case "friend_link":
      handlers.openFriendLink(intent.code);
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
  /**
   * A link or push tap that came before the handlers were registered (a cold
   * start, right after sign-in); dispatched on the next setHandlers call.
   */
  pendingLinkIntent: HavenLinkIntent | null;
  setPendingLinkIntent: (intent: HavenLinkIntent | null) => void;
};

export const useMobilePushNavigationStore = create<MobilePushNavigationState>()(
  (set, get) => ({
    handlers: null,
    pendingLinkIntent: null,
    setHandlers: (handlers) => {
      set({ handlers });
      if (handlers) {
        const pendingLink = get().pendingLinkIntent;
        if (pendingLink) {
          set({ pendingLinkIntent: null });
          dispatchLinkIntent(handlers, pendingLink);
        }
      }
    },
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
