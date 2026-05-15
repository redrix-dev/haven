import { useCallback, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { DrawerNavigationProp } from "@react-navigation/drawer";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { useMobileNotifications } from "@/contexts/MobileNotificationsContext";
import { useMobileSocialWorkspace } from "@/contexts/MobileSocialWorkspaceContext";
import { useMobilePushNotificationRouting } from "@/hooks/useMobilePushNotificationRouting";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";
import type { Rev2DrawerParamList } from "@/haven-rev2/navigation/types";
import { useDmBubbleShellStore } from "@/haven-rev2/stores/dmBubbleShellStore";

/**
 * haven-rev2: registers push tap handlers (parity with `HavenTabNavigator`).
 * Must render under the drawer navigator so `useNavigation` resolves to drawer routes.
 */
export function Rev2PushNavigationHost() {
  useMobilePushNotificationRouting();
  const navigation = useNavigation<DrawerNavigationProp<Rev2DrawerParamList>>();
  const setWorkspaceMode = useNavigationStore((s) => s.setWorkspaceMode);
  const setCurrentServerId = useNavigationStore((s) => s.setCurrentServerId);
  const setCurrentChannelId = useNavigationStore((s) => s.setCurrentChannelId);

  const {
    actions: { refreshDmConversations, openDirectMessageConversation },
  } = useMobileDirectMessages();

  const {
    actions: { refreshNotificationInbox },
  } = useMobileNotifications();

  const {
    actions: { refreshSocialCounts },
  } = useMobileSocialWorkspace();

  const refreshUrgentSurfaces = useCallback(() => {
    void refreshDmConversations({ suppressLoadingState: true });
    void refreshSocialCounts();
    void refreshNotificationInbox({ playSoundsForNew: false });
  }, [refreshDmConversations, refreshNotificationInbox, refreshSocialCounts]);

  useEffect(() => {
    useMobilePushNavigationStore.getState().setHandlers({
      openDm: (conversationId) => {
        setWorkspaceMode("dm");
        useDmBubbleShellStore.getState().requestExpandDmBubble();
        void openDirectMessageConversation(conversationId);
      },
      openFriends: (input) => {
        navigation.navigate("Rev2Friends", {
          screen: "Rev2FriendsHome",
          params: {
            initialTab: input.tab === "requests" ? "requests" : "friends",
            highlightedRequestId: input.highlightedRequestId,
          },
        });
      },
      openMention: (communityId, channelId) => {
        setWorkspaceMode("community");
        setCurrentServerId(communityId);
        setCurrentChannelId(channelId);
        navigation.navigate("Rev2Home", { screen: "Rev2ChannelThread" });
      },
      openNotifications: () => {
        navigation.navigate("Rev2Notifications", { screen: "Rev2NotificationsHome" });
      },
      refreshUrgentSurfaces,
    });

    return () => {
      useMobilePushNavigationStore.getState().setHandlers(null);
    };
  }, [
    navigation,
    openDirectMessageConversation,
    refreshUrgentSurfaces,
    setCurrentChannelId,
    setCurrentServerId,
    setWorkspaceMode,
  ]);

  return null;
}
