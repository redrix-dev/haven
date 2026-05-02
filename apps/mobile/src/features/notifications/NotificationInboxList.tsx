/**
 * Swipe actions: dismiss + mark read only. There is no `mark_notifications_unread` RPC yet (Phase B),
 * so we do not expose “Mark unread” in the UI.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationItem } from "@shared/lib/backend/types";
import {
  getNotificationSummary,
  getNotificationTitle,
} from "@shared/features/notifications/notificationCopy";
import { resolveLiveAvatarUrl, resolveLiveUsername } from "@shared/lib/liveProfiles";
import type { LiveProfileIdentity } from "@shared/lib/backend/types";

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type NotificationInboxListProps = {
  items: NotificationItem[];
  liveProfiles: Record<string, LiveProfileIdentity>;
  refreshing: boolean;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDismiss: (recipientId: string) => void;
  onMarkRead: (recipientId: string) => void;
  onNavigate: (notification: NotificationItem) => void;
};

export function NotificationInboxList({
  items,
  liveProfiles,
  refreshing,
  loading,
  error,
  onRefresh,
  onDismiss,
  onMarkRead,
  onNavigate,
}: NotificationInboxListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((recipientId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipientId)) next.delete(recipientId);
      else next.add(recipientId);
      return next;
    });
  }, []);

  const renderRightActions = useCallback(
    (notification: NotificationItem) => {
      const unread = notification.readAt == null;
      return (
        <View className="flex-row">
          {unread ? (
            <Pressable
              accessibilityRole="button"
              className="w-24 items-center justify-center bg-accent-slider"
              onPress={() => onMarkRead(notification.recipientId)}
            >
              <Text className="text-center text-xs font-semibold text-white">Read</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="w-24 items-center justify-center bg-red-900/90"
            onPress={() => onDismiss(notification.recipientId)}
          >
            <Text className="text-center text-xs font-semibold text-white">Dismiss</Text>
          </Pressable>
        </View>
      );
    },
    [onDismiss, onMarkRead],
  );

  const renderItem: ListRenderItem<NotificationItem> = useCallback(
    ({ item }) => {
      const expanded = expandedIds.has(item.recipientId);
      const actorLabel =
        resolveLiveUsername(liveProfiles, item.actorUserId, item.actorUsername)?.trim() ||
        item.actorUserId ||
        "System";
      const avatarUrl = resolveLiveAvatarUrl(
        liveProfiles,
        item.actorUserId,
        item.actorAvatarUrl,
      );
      const initial = actorLabel.trim().charAt(0).toUpperCase() || "N";
      const title = getNotificationTitle(item);
      const summary = getNotificationSummary(item);
      const unread = item.readAt == null;

      return (
        <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
          <View className="border-b border-border bg-card py-3">
            <Pressable
              onPress={() => toggleExpanded(item.recipientId)}
              className="active:bg-surface-hover"
              accessibilityRole="button"
            >
              <View className="flex-row gap-3">
                <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{ width: 40, height: 40 }}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <Text className="text-lg font-semibold text-foreground">{initial}</Text>
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className={`shrink text-base ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      numberOfLines={expanded ? undefined : 1}
                    >
                      {title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{formatShortTime(item.createdAt)}</Text>
                  </View>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {actorLabel}
                  </Text>
                  <Text
                    className={`mt-1 text-sm ${unread ? "text-foreground" : "text-muted-foreground"}`}
                    numberOfLines={expanded ? undefined : 2}
                  >
                    {summary}
                  </Text>
                </View>
              </View>
            </Pressable>
            {expanded ? (
              <Pressable
                accessibilityRole="button"
                className="mt-3 self-start rounded-lg bg-accent-slider px-3 py-2 active:opacity-90"
                onPress={() => onNavigate(item)}
              >
                <Text className="text-sm font-semibold text-white">Navigate</Text>
              </Pressable>
            ) : null}
          </View>
        </Swipeable>
      );
    },
    [expandedIds, liveProfiles, onNavigate, renderRightActions, toggleExpanded],
  );

  if (loading && items.length === 0) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#e6edf7" />
        <Text className="mt-3 text-sm text-muted-foreground">Loading notifications…</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.recipientId}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e6edf7" />
      }
      ListHeaderComponent={
        error ? (
          <Text className="mb-3 text-sm text-red-400">{error}</Text>
        ) : null
      }
      ListEmptyComponent={
        <View className="items-center py-10">
          <Ionicons name="notifications-off-outline" size={40} color="#8b9cbb" />
          <Text className="mt-3 text-center text-sm text-muted-foreground">
            No notifications here. Mentions and updates show up once you start chatting.
          </Text>
        </View>
      }
    />
  );
}
