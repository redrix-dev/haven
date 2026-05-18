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
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useServersStore } from "@shared/stores/serversStore";
import type { RootStackParamList } from "@/navigation/types";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { useMobileNotifications } from "@/contexts/MobileNotificationsContext";
import { useMobileSocialWorkspace } from "@/contexts/MobileSocialWorkspaceContext";
import { NotificationInboxList } from "@/features/notifications/NotificationInboxList";
import { NotificationPreferencesPanel } from "@/features/notifications/NotificationPreferencesPanel";
import { MobileModmailPanel } from "@/features/moderation/MobileModmailPanel";

export type NotificationsFriendsPanelOpenInput = {
  tab: "requests" | "friends";
  highlightedRequestId: string | null;
};

type NotificationsContainerProps = {
  subScreen: "list" | "preferences" | "modmail";
  onSubScreenChange: (next: "list" | "preferences" | "modmail") => void;
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
  const servers = useServersStore((s) => s.servers);
  const permissionsByServerId = usePermissionsStore((s) => s.permissionsByServerId);
  const setWorkspaceMode = useNavigationStore((s) => s.setWorkspaceMode);

  const modmailCommunityIds = useMemo(
    () =>
      servers
        .filter((s) => permissionsByServerId[s.id]?.canManageReports)
        .map((s) => s.id),
    [servers, permissionsByServerId],
  );
  const modmailEnabled = modmailCommunityIds.length > 0;

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
      useNavigationStore.getState().setCommunityNavigation(communityId, channelId);
      navigation.dispatch(
        CommonActions.navigate({
          name: "Main",
          params: {
            screen: "Community",
            params: { serverId: communityId, openDrawer: false },
          },
        }),
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
      if (subScreen === "preferences" || subScreen === "modmail") {
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
        {subScreen === "preferences" || subScreen === "modmail" ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onSubScreenChange("list")}
            className="flex-row items-center gap-2 active:opacity-80"
          >
            <Ionicons name="chevron-back" size={22} color="#e6edf7" />
            <Text className="text-lg font-semibold text-foreground">
              {subScreen === "preferences" ? "Preferences" : "ModMail"}
            </Text>
          </Pressable>
        ) : (
          <>
            <Text className="text-lg font-semibold text-foreground">Notifications</Text>
            <View className="flex-row items-center gap-2">
              {modmailEnabled ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => onSubScreenChange("modmail")}
                  className="rounded-xl border border-amber-600/50 bg-amber-950/35 p-2 active:bg-amber-950/55"
                >
                  <Ionicons name="shield-outline" size={22} color="#fbbf24" />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => onSubScreenChange("preferences")}
                className="rounded-xl bg-surface-panel p-2 active:bg-surface-hover"
              >
                <Ionicons name="settings-outline" size={22} color="#e6edf7" />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {subScreen === "modmail" ? (
        <MobileModmailPanel managedCommunityIds={modmailCommunityIds} />
      ) : subScreen === "preferences" ? (
        <NotificationPreferencesPanel
          preferences={notificationPreferences}
          loading={notificationPreferencesLoading}
          saving={notificationPreferencesSaving}
          error={notificationPreferencesError}
          onSave={saveNotificationPreferences}
        />
      ) : subScreen === "list" ? (
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
      ) : null}
    </View>
  );
}
