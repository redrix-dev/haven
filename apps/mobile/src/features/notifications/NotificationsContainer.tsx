import { useCallback, useEffect, useMemo } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useNotificationInteractions } from "@shared/features/notifications/hooks/useNotificationInteractions";
import { filterNotificationsForInbox } from "@shared/features/notifications/inboxNotificationFilter";
import { getNotificationBackend, getSocialBackend } from "@shared/lib/backend";
import type { NotificationItem } from "@shared/lib/backend/types";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import type { RootStackParamList } from "@/navigation/types";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { useMobileNotifications } from "@/contexts/MobileNotificationsContext";
import { useMobileSocialWorkspace } from "@/contexts/MobileSocialWorkspaceContext";
import { NotificationInboxList } from "@/features/notifications/NotificationInboxList";
import { NotificationPreferencesPanel } from "@/features/notifications/NotificationPreferencesPanel";

export type NotificationsFriendsPanelOpenInput = {
  tab: "requests" | "friends";
  highlightedRequestId: string | null;
};

type NotificationsContainerProps = {
  subScreen: "list" | "preferences";
  onSubScreenChange: (next: "list" | "preferences") => void;
  modalVisible: boolean;
  onCloseModal: () => void;
  onOpenFriendsPanel: (input: NotificationsFriendsPanelOpenInput) => void;
  onOpenDirectMessages: () => void;
};

export default function NotificationsContainer({
  subScreen,
  onSubScreenChange,
  modalVisible,
  onCloseModal,
  onOpenFriendsPanel,
  onOpenDirectMessages,
}: NotificationsContainerProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const liveProfiles = useLiveProfilesStore((s) => s.profiles);
  const setCurrentServerId = useNavigationStore((s) => s.setCurrentServerId);
  const setCurrentChannelId = useNavigationStore((s) => s.setCurrentChannelId);
  const setWorkspaceMode = useNavigationStore((s) => s.setWorkspaceMode);

  const {
    state: {
      notificationItems,
      notificationsRefreshing,
      notificationsError,
      notificationsLoading,
      notificationPreferences,
      notificationPreferencesLoading,
      notificationPreferencesSaving,
      notificationPreferencesError,
    },
    actions: {
      refreshNotificationsManually,
      markNotificationRead,
      dismissNotification,
      saveNotificationPreferences,
      setNotificationsError,
      refreshNotificationInbox,
    },
  } = useMobileNotifications();

  const {
    actions: { refreshSocialCounts },
  } = useMobileSocialWorkspace();

  const {
    actions: { openDirectMessageConversation },
  } = useMobileDirectMessages();

  const notificationBackend = useMemo(() => getNotificationBackend(), []);
  const socialBackend = useMemo(() => getSocialBackend(), []);

  const {
    actions: { openNotificationItem },
  } = useNotificationInteractions({
    notificationBackend,
    socialBackend,
    refreshNotificationInbox,
    refreshSocialCounts,
    setNotificationsError,
    onOpenDmConversation: async (conversationId) => {
      setWorkspaceMode("dm");
      await openDirectMessageConversation(conversationId);
      onOpenDirectMessages();
    },
    onOpenFriendsPanel: ({ tab, highlightedRequestId }) => {
      onOpenFriendsPanel({ tab, highlightedRequestId });
    },
    onOpenChannelMention: ({ communityId, channelId }) => {
      setWorkspaceMode("community");
      setCurrentServerId(communityId);
      setCurrentChannelId(channelId);
      navigation.dispatch(
        CommonActions.navigate({ name: "Main", params: { screen: "Community" } }),
      );
    },
  });

  const inboxItems = useMemo(
    () => filterNotificationsForInbox(notificationItems),
    [notificationItems],
  );

  const handleNavigate = useCallback(
    async (notification: NotificationItem) => {
      await openNotificationItem(notification);
      onCloseModal();
    },
    [onCloseModal, openNotificationItem],
  );

  useEffect(() => {
    if (!modalVisible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (subScreen === "preferences") {
        onSubScreenChange("list");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [modalVisible, onSubScreenChange, subScreen]);

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-4 flex-row items-center justify-between">
        {subScreen === "preferences" ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onSubScreenChange("list")}
            className="flex-row items-center gap-2 active:opacity-80"
          >
            <Ionicons name="chevron-back" size={22} color="#e6edf7" />
            <Text className="text-lg font-semibold text-foreground">Preferences</Text>
          </Pressable>
        ) : (
          <>
            <Text className="text-lg font-semibold text-foreground">Notifications</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => onSubScreenChange("preferences")}
              className="rounded-xl bg-surface-panel p-2 active:bg-surface-hover"
            >
              <Ionicons name="settings-outline" size={22} color="#e6edf7" />
            </Pressable>
          </>
        )}
      </View>

      {subScreen === "preferences" ? (
        <NotificationPreferencesPanel
          preferences={notificationPreferences}
          loading={notificationPreferencesLoading}
          saving={notificationPreferencesSaving}
          error={notificationPreferencesError}
          onSave={saveNotificationPreferences}
        />
      ) : (
        <NotificationInboxList
          items={inboxItems}
          liveProfiles={liveProfiles}
          refreshing={notificationsRefreshing}
          loading={notificationsLoading}
          error={notificationsError}
          onRefresh={() => {
            void refreshNotificationsManually();
          }}
          onDismiss={(recipientId) => {
            void dismissNotification(recipientId);
          }}
          onMarkRead={(recipientId) => {
            void markNotificationRead(recipientId);
          }}
          onNavigate={(n) => {
            void handleNavigate(n);
          }}
        />
      )}
    </View>
  );
}
