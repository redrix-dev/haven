import { FlatList, Image, Pressable, Text, View } from "react-native";
import type { Notification } from "@shared/lib/backend/records";
import { inboxNotifications } from "@shared/collections/notifications/selectors";
import { notificationIntent } from "@shared/features/links";
import { useAvatarUrl, useHavenCore, useNameOf, useStore } from "@mobile-data";
import {
  dispatchLinkIntent,
  useMobilePushNavigationStore,
} from "@/stores/mobilePushNavigationStore";
import { ThemedIonicons } from "@/theme-rn";

/**
 * The inbox, newest first, as the database wrote each notification (title
 * and body included). Opening one marks it read and goes where it points,
 * the same place a push tap would.
 */
export function NotificationInboxList() {
  const core = useHavenCore();
  const notifications = useStore("notifications", inboxNotifications);
  const inbox = useStore("notifications", (s) => s.inbox);
  const refreshing = useStore(
    "notifications",
    (s) => s.requests.inbox?.running ?? false,
  );

  return (
    <FlatList
      data={notifications}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => <NotificationRow item={item} />}
      refreshing={refreshing}
      onRefresh={() => void core.notifications.load()}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (inbox && !inbox.atOldest) void core.notifications.loadOlder();
      }}
      ListEmptyComponent={
        <View className="items-center gap-2 py-16">
          <ThemedIonicons
            name="notifications-outline"
            size={28}
            colorClassName="accent-muted-foreground"
          />
          <Text className="text-sm text-muted-foreground">
            You're all caught up
          </Text>
        </View>
      }
    />
  );
}

function NotificationRow({ item }: { item: Notification }) {
  const core = useHavenCore();
  const unread = item.read_at === null;
  const actorName = useNameOf(item.actor_id ?? "");
  const actorAvatar = useAvatarUrl(item.actor_id);
  const name = item.actor_id ? actorName : "Haven";

  const open = () => {
    if (unread) void core.notifications.mark("read", [item.id]).catch(() => {});
    const intent = notificationIntent(item);
    const handlers = useMobilePushNavigationStore.getState().handlers;
    if (intent && intent.kind !== "notifications" && handlers) {
      dispatchLinkIntent(handlers, intent);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      onLongPress={() =>
        void core.notifications.mark("dismissed", [item.id]).catch(() => {})
      }
      className="flex-row items-start gap-3 border-b border-border-panel py-3 active:bg-surface-hover"
    >
      <View
        className={`mt-3 h-2 w-2 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`}
      />
      <View className="h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
        {actorAvatar ? (
          <Image
            source={{ uri: actorAvatar }}
            style={{ width: 36, height: 36 }}
          />
        ) : (
          <Text className="text-sm font-semibold text-foreground">
            {name.charAt(0).toUpperCase() || "H"}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-foreground">
          {item.title}
        </Text>
        {item.body ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {item.body}
          </Text>
        ) : null}
        <Text className="mt-1 text-[11px] text-muted-foreground">
          {formatNotificationTime(item.created_at)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        hitSlop={10}
        onPress={() =>
          void core.notifications.mark("dismissed", [item.id]).catch(() => {})
        }
        className="p-1"
      >
        <ThemedIonicons
          name="close"
          size={16}
          colorClassName="accent-muted-foreground"
        />
      </Pressable>
    </Pressable>
  );
}

function formatNotificationTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
