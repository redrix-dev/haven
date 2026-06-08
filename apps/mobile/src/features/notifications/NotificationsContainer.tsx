import { useCallback, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedIonicons } from "@/theme-rn";
import type { NotificationItem } from "@shared/lib/backend/types";
import { syncFocusFromRoute, useHavenCore } from "@mobile-data";
import { useUiStore } from "@mobile-data/session/uiStore";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { getNotificationPayloadString } from "@shared/infrastructure/utils/appUtils";
import type { MainStackParamList } from "@/navigation/types";
import { NotificationInboxList } from "@/features/notifications/NotificationInboxList";
import { NotificationPreferencesPanel } from "@/features/notifications/NotificationPreferencesPanel";

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
  const setWorkspaceMode = useUiStore((s) => s.setWorkspaceMode);
  const [subScreen, setSubScreen] = useState<"list" | "preferences">("list");
  const [notificationNavigationError, setNotificationNavigationError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (subScreen === "preferences") {
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
            navigation.navigate("Community", {
              pendingDmConversationId: conversationId,
              serverId: null,
              openDrawer: false,
            });
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
        {subScreen === "preferences" ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setSubScreen("list")}
            className="flex-row items-center gap-2 active:opacity-80"
          >
            <ThemedIonicons name="chevron-back" size={22} colorClassName="accent-foreground" />
            <Text className="text-lg font-semibold text-foreground">Preferences</Text>
          </Pressable>
        ) : (
          <>
            <Text className="text-lg font-semibold text-foreground">Notifications</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setSubScreen("preferences")}
              className="rounded-xl bg-surface-panel p-2 active:bg-surface-hover"
            >
              <ThemedIonicons name="settings-outline" size={22} colorClassName="accent-foreground" />
            </Pressable>
          </>
        )}
      </View>

      {subScreen === "preferences" ? (
        <NotificationPreferencesPanel />
      ) : (
        <NotificationInboxList
          navigationError={notificationNavigationError}
          onNavigate={(n) => { void handleNavigate(n); }}
        />
      )}
    </View>
  );
}
