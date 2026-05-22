import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useNotificationInteractions } from "@shared/features/notifications/hooks/useNotificationInteractions";
import type { NotificationItem } from "@shared/lib/backend/types";
import { syncFocusFromRoute, useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import type { RootStackParamList } from "@/navigation/types";
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
  const core = useHavenCore();
  const communities = core.communities.useCommunities();
  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const [
    notificationNavigationError,
    setNotificationNavigationError,
  ] = useState<string | null>(null);

  const modmailCommunityIds = useMemo(
    () =>
      communities
        .filter(
          (community) =>
            permissionsByCommunityId[community.id]?.canManageReports,
        )
        .map((community) => community.id),
    [communities, permissionsByCommunityId],
  );
  const modmailEnabled = modmailCommunityIds.length > 0;

  const refreshSocialCounts = useCallback(async () => {
    await core.social.load();
  }, [core.social]);

  const refreshNotificationInbox = useCallback(async () => {
    await core.notifications.refreshInbox();
  }, [core.notifications]);

  const {
    actions: { openNotificationItem },
  } = useNotificationInteractions({
    notificationBackend: core.backends.notifications,
    socialBackend: core.backends.social,
    refreshNotificationInbox,
    refreshSocialCounts,
    setNotificationsError: setNotificationNavigationError,
    onOpenDmConversation: async (conversationId) => {
      setWorkspaceMode("dm");
      await core.directMessages.openConversation(conversationId, {
        markRead: true,
      });
      onOpenDirectMessages();
    },
    onOpenFriendsPanel: ({ tab, highlightedRequestId }) => {
      onOpenFriendsPanel({ tab, highlightedRequestId });
    },
    onOpenChannelMention: ({ communityId, channelId }) => {
      setWorkspaceMode("community");
      syncFocusFromRoute(core, { communityId, channelId });
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

  const handleNavigate = useCallback(
    async (notification: NotificationItem) => {
      setNotificationNavigationError(null);
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
        <NotificationPreferencesPanel />
      ) : subScreen === "list" ? (
        <NotificationInboxList
          navigationError={notificationNavigationError}
          onNavigate={(n) => {
            void handleNavigate(n);
          }}
        />
      ) : null}
    </View>
  );
}
