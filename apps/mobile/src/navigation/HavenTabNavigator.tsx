import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
} from "@react-navigation/native";
import type { BottomTabNavigatorProps } from "@react-navigation/bottom-tabs";
import type { FriendsPanelTab } from "@shared/types/types";
import { countFilteredUnreadInInbox } from "@shared/features/notifications/inboxNotificationFilter";
import { useUiStore } from "@shared/stores/uiStore";
import { syncFocusFromRoute, useHavenCore } from "@shared/core";
import { useAuthStore } from "@shared/stores/authStore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { HavenFormSheet } from "@/components/HavenFormSheet";
import { HavenListSheet } from "@/components/HavenListSheet";
import { HavenNavbar } from "@/components/HavenNavbar";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { useMobileNotifications } from "@/contexts/MobileNotificationsContext";
import { useMobileSocialWorkspace } from "@/contexts/MobileSocialWorkspaceContext";
import { DirectMessagesContainer } from "@/features/direct-messages/DirectMessagesContainer";
import { FriendsModalContainer } from "@/features/friends/FriendsModalContainer";
import NotificationsContainer from "@/features/notifications/NotificationsContainer";
import { deleteOwnAccount, signOutFromAuth } from "@/auth/mobileAuthService";
import UserSettingsContainer from "@/features/user-profile/UserSettingsContainer";
import { useMobilePushNotificationRouting } from "@/hooks/useMobilePushNotificationRouting";
import { useMobilePushNavigationStore } from "@/stores/mobilePushNavigationStore";

function HavenTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
}: BottomTabNavigatorProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const core = useHavenCore();
  const {
    state,
    descriptors,
    NavigationContent,
    navigation: tabNavigation,
  } = useNavigationBuilder(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    UNSTABLE_routeNamesChangeBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
  });

  const {
    actions: { refreshNotificationInbox },
    state: { notificationItems },
  } = useMobileNotifications();

  const {
    state: { socialCounts },
    actions: { refreshSocialCounts },
  } = useMobileSocialWorkspace();

  const {
    state: { dmConversations },
    actions: {
      refreshDmConversations,
      openDirectMessageConversation,
      openDirectMessageWithUser,
    },
  } = useMobileDirectMessages();

  useMobilePushNotificationRouting();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);
  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [notificationsSubScreen, setNotificationsSubScreen] = useState<
    "list" | "preferences" | "modmail"
  >("list");
  const handleOpenNotifications = useCallback(() => {
    setIsNotificationsModalOpen(true);
  }, []);
  const handleCloseNotifications = useCallback(() => {
    setNotificationsSubScreen("list");
    setIsNotificationsModalOpen(false);
  }, []);

  useEffect(() => {
    useUiStore.getState().setNotificationsPanelOpen(isNotificationsModalOpen);
    return () => {
      useUiStore.getState().setNotificationsPanelOpen(false);
    };
  }, [isNotificationsModalOpen]);

  const filteredNotificationsUnread = useMemo(
    () => countFilteredUnreadInInbox(notificationItems),
    [notificationItems],
  );

  const dmUnreadTotal = useMemo(
    () => dmConversations.reduce((acc, c) => acc + c.unreadCount, 0),
    [dmConversations],
  );

  const [isDirectMessagesModalOpen, setIsDirectMessagesModalOpen] = useState(false);
  const handleOpenDirectMessages = useCallback(() => {
    setWorkspaceMode("dm");
    setIsDirectMessagesModalOpen(true);
  }, [setWorkspaceMode]);
  const handleCloseDirectMessages = useCallback(() => {
    setIsDirectMessagesModalOpen(false);
    setWorkspaceMode("community");
  }, [setWorkspaceMode]);

  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<FriendsPanelTab>("friends");
  const [friendsHighlightedRequestId, setFriendsHighlightedRequestId] = useState<string | null>(
    null,
  );
  const handleOpenFriends = useCallback(() => {
    setFriendsInitialTab("friends");
    setFriendsHighlightedRequestId(null);
    setIsFriendsModalOpen(true);
  }, []);
  const handleCloseFriends = useCallback(() => {
    setIsFriendsModalOpen(false);
  }, []);

  const handleOpenFriendsFromNotification = useCallback(
    (input: { tab: "requests" | "friends"; highlightedRequestId: string | null }) => {
      setFriendsInitialTab(input.tab === "requests" ? "requests" : "friends");
      setFriendsHighlightedRequestId(input.highlightedRequestId);
      setIsFriendsModalOpen(true);
    },
    [],
  );

  const handleStartDmFromFriend = useCallback(
    (friendUserId: string) => {
      setIsFriendsModalOpen(false);
      setWorkspaceMode("dm");
      setIsDirectMessagesModalOpen(true);
      void openDirectMessageWithUser(friendUserId);
    },
    [openDirectMessageWithUser, setWorkspaceMode],
  );

  useEffect(() => {
    useMobilePushNavigationStore.getState().setHandlers({
      openDm: (conversationId) => {
        setWorkspaceMode("dm");
        setIsDirectMessagesModalOpen(true);
        void openDirectMessageConversation(conversationId);
      },
      openFriends: (input) => {
        handleOpenFriendsFromNotification(input);
      },
      openMention: (communityId, channelId) => {
        setWorkspaceMode("community");
        syncFocusFromRoute(core, { communityId, channelId });
        tabNavigation.navigate("Community");
      },
      openNotifications: () => {
        setIsNotificationsModalOpen(true);
      },
      refreshUrgentSurfaces: () => {
        void refreshDmConversations({ suppressLoadingState: true });
        void refreshSocialCounts();
        void refreshNotificationInbox();
      },
    });

    return () => {
      useMobilePushNavigationStore.getState().setHandlers(null);
    };
  }, [
    handleOpenFriendsFromNotification,
    openDirectMessageConversation,
    refreshDmConversations,
    refreshNotificationInbox,
    refreshSocialCounts,
    setWorkspaceMode,
    tabNavigation,
    core,
  ]);

  return (
    <>
      <NavigationContent>
        <View className="flex-1 bg-surface-modal">
          <HavenNavbar
            onPressSettings={handleOpenSettings}
            onPressNotifications={handleOpenNotifications}
            notificationsUnreadCount={filteredNotificationsUnread}
            dmUnreadCount={dmUnreadTotal}
            friendRequestCount={socialCounts.incomingPendingRequestCount}
            onPressDirectMessages={handleOpenDirectMessages}
            onPressFriends={handleOpenFriends}
          />
          <View style={styles.screensContainer}>
            {state.routes.map((route) => {
              const descriptor = descriptors[route.key];
              const isFocused = state.routes[state.index].key === route.key;
              return (
                <View
                  key={route.key}
                  style={[
                    StyleSheet.absoluteFillObject,
                    { opacity: isFocused ? 1 : 0 },
                  ]}
                  pointerEvents={isFocused ? "auto" : "none"}
                >
                  {descriptor.render()}
                </View>
              );
            })}
          </View>
        </View>
      </NavigationContent>
      <HavenFormSheet
        visible={isSettingsModalOpen}
        onDismiss={handleCloseSettings}
        title="Settings"
      >
        <UserSettingsContainer
          onSignOut={async () => {
            await signOutFromAuth();
            handleCloseSettings();
          }}
          onDeleteAccount={async () => {
            await deleteOwnAccount();
            handleCloseSettings();
          }}
        />
      </HavenFormSheet>
      <HavenListSheet
        visible={isNotificationsModalOpen}
        onDismiss={handleCloseNotifications}
        bodyScrollable={false}
      >
        <NotificationsContainer
          subScreen={notificationsSubScreen}
          onSubScreenChange={setNotificationsSubScreen}
          modalVisible={isNotificationsModalOpen}
          onCloseModal={handleCloseNotifications}
          onOpenFriendsPanel={handleOpenFriendsFromNotification}
          onOpenDirectMessages={handleOpenDirectMessages}
        />
      </HavenListSheet>
      <HavenListSheet
        visible={isDirectMessagesModalOpen}
        onDismiss={handleCloseDirectMessages}
        title="Direct messages"
        bodyScrollable={false}
      >
        <DirectMessagesContainer />
      </HavenListSheet>
      <HavenListSheet
        visible={isFriendsModalOpen}
        onDismiss={handleCloseFriends}
        title="Friends"
        bodyScrollable={false}
      >
        <FriendsModalContainer
          visible={isFriendsModalOpen}
          userId={userId}
          initialTab={friendsInitialTab}
          highlightedRequestId={friendsHighlightedRequestId}
          onStartDirectMessage={handleStartDmFromFriend}
        />
      </HavenListSheet>
    </>
  );
}

const styles = StyleSheet.create({
  screensContainer: {
    flex: 1,
  },
});

export const createHavenTabNavigator = createNavigatorFactory(HavenTabNavigator);
