import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useHydrateMobileThemeFromProfile } from "@/hooks/useHydrateMobileThemeFromProfile";
import { MobileNotificationsProvider } from "@/contexts/MobileNotificationsContext";
import { MobileDirectMessagesProvider } from "@/contexts/MobileDirectMessagesContext";
import { MobileMainSessionProvider } from "@/contexts/MobileMainSessionContext";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { HomeScreen } from "@/screens/main/HomeScreen";
import { CommunityShell } from "@/navigation/community/CommunityShell";
import type { MainStackParamList } from "@/navigation/types";
import { NAV_THEME } from "@/lib/theme";
import { setMobileNavigationDelegate } from "@/lib/registerMobileAppHost";
import { requireHavenCore } from "@shared/core";
import { MOBILE_DEFAULT_NOTIFICATION_AUDIO } from "@/constants/mobileNotificationAudioDefaults";
import { HavenFormSheet } from "@/components/HavenFormSheet";
import { HavenListSheet } from "@/components/HavenListSheet";
import { DirectMessagesContainer } from "@/features/direct-messages/DirectMessagesContainer";
import { FriendsModalContainer } from "@/features/friends/FriendsModalContainer";
import NotificationsContainer from "@/features/notifications/NotificationsContainer";
import UserSettingsContainer from "@/features/user-profile/UserSettingsContainer";
import { SideRail } from "@/navigation/shell/SideRail";
import { deleteOwnAccount, signOutFromAuth } from "@/auth/mobileAuthService";
import { useUiStore } from "@shared/stores/uiStore";
import type { FriendsPanelTab } from "@shared/types/types";

const Stack = createNativeStackNavigator<MainStackParamList>();

const mainStackScreenBackground = NAV_THEME.dark.colors.background;

/**
 * Bridges React Navigation imperative API into the shared AppHost so external
 * events (notification taps, deep links, access-revoked redirects) can move
 * the user without a navigation ref reaching into shared code.
 */
function MainNavigationDelegateBridge() {
  const navigation =
    useNavigation<NavigationProp<MainStackParamList>>();

  useEffect(() => {
    setMobileNavigationDelegate({
      navigateToCommunity: (serverId, channelId) => {
        try {
          requireHavenCore().communities.setActiveId(serverId);
          if (channelId) {
            requireHavenCore().channels.setActiveChannelId(channelId);
          }
        } catch {
          // HavenCore may not be ready during cold-start race; navigation alone is fine.
        }
        navigation.navigate("Community", { serverId });
      },
      navigateToDm: (_conversationId) => {
        // DM workspace is Phase 4 — for now route to Home where DMs live.
        navigation.navigate("Home");
      },
    });
    return () => setMobileNavigationDelegate(null);
  }, [navigation]);

  return null;
}

function MainNavigationShell({ userId }: { userId: string }) {
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const {
    actions: { openDirectMessageWithUser },
  } = useMobileDirectMessages();

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
  const [friendsHighlightedRequestId, setFriendsHighlightedRequestId] =
    useState<string | null>(null);
  const handleOpenFriendsFromNotification = useCallback(
    (input: { tab: "requests" | "friends"; highlightedRequestId: string | null }) => {
      setFriendsInitialTab(input.tab === "requests" ? "requests" : "friends");
      setFriendsHighlightedRequestId(input.highlightedRequestId);
      setIsFriendsModalOpen(true);
    },
    [],
  );
  const handleCloseFriends = useCallback(() => {
    setIsFriendsModalOpen(false);
  }, []);

  const handleStartDmFromFriend = useCallback(
    (friendUserId: string) => {
      setIsFriendsModalOpen(false);
      setWorkspaceMode("dm");
      setIsDirectMessagesModalOpen(true);
      void openDirectMessageWithUser(friendUserId);
    },
    [openDirectMessageWithUser, setWorkspaceMode],
  );

  return (
    <>
      <MainNavigationDelegateBridge />
      <View className="flex-1">
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: mainStackScreenBackground },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Community"
            component={CommunityShell}
            options={{
              animation: "slide_from_right",
              gestureEnabled: true,
            }}
          />
        </Stack.Navigator>
        <SideRail
          onOpenNotifications={handleOpenNotifications}
          onOpenInbox={handleOpenDirectMessages}
          onOpenProfile={handleOpenSettings}
          onOpenSettings={handleOpenSettings}
        />
      </View>

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

export function MainNavigator() {
  const session = useAuthSession();
  const userId = session?.user?.id;
  useHydrateMobileThemeFromProfile(userId);

  if (!userId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <ActivityIndicator color="#e6edf7" size="large" />
      </View>
    );
  }

  return (
    <MobileNotificationsProvider userId={userId} audioSettings={MOBILE_DEFAULT_NOTIFICATION_AUDIO}>
        <MobileDirectMessagesProvider userId={userId}>
          <MobileMainSessionProvider userId={userId}>
            <MainNavigationShell userId={userId} />
          </MobileMainSessionProvider>
        </MobileDirectMessagesProvider>
    </MobileNotificationsProvider>
  );
}
