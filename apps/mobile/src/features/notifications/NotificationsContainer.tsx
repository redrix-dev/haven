import { useCallback, useMemo, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationItem } from "@shared/lib/backend/types";
import { syncFocusFromRoute, useHavenCore } from "@shared/core";
import { useUiStore } from "@shared/stores/uiStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { getNotificationPayloadString } from "@shared/infrastructure/utils/appUtils";
import type { MainStackParamList } from "@/navigation/types";
import { NotificationInboxList } from "@/features/notifications/NotificationInboxList";
import { NotificationPreferencesPanel } from "@/features/notifications/NotificationPreferencesPanel";
import { MobileModmailPanel } from "@/features/moderation/MobileModmailPanel";

export type NotificationsFriendsPanelOpenInput = {
  tab: "requests" | "friends";
  highlightedRequestId: string | null;
};

type NotificationsContainerProps = {
  onOpenFriendsPanel: (input: NotificationsFriendsPanelOpenInput) => void;
};

export default function NotificationsContainer({
  onOpenFriendsPanel,
}: NotificationsContainerProps) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const core = useHavenCore();
  const communities = core.communities.useCommunities();
  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const [subScreen, setSubScreen] = useState<"list" | "preferences" | "modmail">("list");
  const [notificationNavigationError, setNotificationNavigationError] = useState<string | null>(null);

  const modmailCommunityIds = useMemo(
    () =>
      communities
        .filter((c) => permissionsByCommunityId[c.id]?.canManageReports)
        .map((c) => c.id),
    [communities, permissionsByCommunityId],
  );
  const modmailEnabled = modmailCommunityIds.length > 0;

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (subScreen === "preferences" || subScreen === "modmail") {
          setSubScreen("list");
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [subScreen]),
  );

  const handleNavigate = useCallback(
    async (notification: NotificationItem) => {
      setNotificationNavigationError(null);
      try {
        switch (notification.kind) {
          case "dm_message": {
            const conversationId = getNotificationPayloadString(notification, "conversationId");
            if (!conversationId) {
              throw new Error("This notification does not include a DM conversation target.");
            }
            void core.notifications.markRead([notification.recipientId]).catch(() => {});
            navigation.navigate("DirectMessages", { openConversationId: conversationId });
            return;
          }
          case "friend_request_received": {
            onOpenFriendsPanel({
              tab: "requests",
              highlightedRequestId: getNotificationPayloadString(notification, "friendRequestId"),
            });
            break;
          }
          case "friend_request_accepted": {
            onOpenFriendsPanel({ tab: "friends", highlightedRequestId: null });
            break;
          }
          case "channel_mention": {
            const communityId = getNotificationPayloadString(notification, "communityId");
            const channelId = getNotificationPayloadString(notification, "channelId");
            if (!communityId || !channelId) {
              throw new Error("This mention notification does not include a channel target.");
            }
            setWorkspaceMode("community");
            syncFocusFromRoute(core, { communityId, channelId });
            void core.notifications.markRead([notification.recipientId]).catch(() => {});
            navigation.replace("Community", { serverId: communityId, openDrawer: false });
            return;
          }
          default:
            break;
        }

        await core.notifications.markRead([notification.recipientId]);
      } catch (error) {
        setNotificationNavigationError(
          getErrorMessage(error, "Failed to open notification."),
        );
      }
    },
    [core, navigation, onOpenFriendsPanel, setWorkspaceMode],
  );

  return (
    <View className="min-h-0 flex-1">
      <View className="mb-4 flex-row items-center justify-between">
        {subScreen === "preferences" || subScreen === "modmail" ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setSubScreen("list")}
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
                  onPress={() => setSubScreen("modmail")}
                  className="rounded-xl border border-amber-600/50 bg-amber-950/35 p-2 active:bg-amber-950/55"
                >
                  <Ionicons name="shield-outline" size={22} color="#fbbf24" />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setSubScreen("preferences")}
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
      ) : (
        <NotificationInboxList
          navigationError={notificationNavigationError}
          onNavigate={(n) => {
            void handleNavigate(n);
          }}
        />
      )}
    </View>
  );
}
