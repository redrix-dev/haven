import type { ServerSummary } from "@shared/lib/backend/types";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedIonicons, type ThemedIoniconsProps } from "@/theme-rn";

type CommunityRailProps = {
  communities: ServerSummary[];
  activeCommunityId: string | null;
  onSelectCommunity: (communityId: string) => void;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
  onOpenFriends: () => void;
  onOpenInbox: () => void;
  notificationsUnreadCount: number;
  inboxUnreadCount: number;
  friendRequestCount: number;
  onOpenCommunityActions: () => void;
  /** Highlight the DM icon when the inbox surface is currently active. */
  isDmActive?: boolean;
};

type RailActionButtonProps = {
  accessibilityLabel: string;
  icon: ThemedIoniconsProps["name"];
  iconSize?: number;
  badgeCount?: number;
  isActive?: boolean;
  onPress: () => void;
};

function getCommunityInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function RailActionButton({
  accessibilityLabel,
  icon,
  iconSize = 24,
  badgeCount = 0,
  isActive = false,
  onPress,
}: RailActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        badgeCount > 0
          ? `${accessibilityLabel}, ${badgeCount} unread`
          : accessibilityLabel
      }
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      className={[
        "h-11 w-11 items-center justify-center rounded-2xl",
        isActive
          ? "bg-primary active:bg-primary/80"
          : "bg-surface-panel active:bg-surface-hover",
      ].join(" ")}
    >
      <View className="relative">
        <ThemedIonicons
          name={icon}
          size={iconSize}
          colorClassName={
            isActive ? "accent-primary-foreground" : "accent-foreground"
          }
        />
        {badgeCount > 0 ? (
          <View className="absolute -right-2 -top-2 min-w-5 rounded-full bg-accent-slider px-1 py-0.5">
            <Text className="text-center text-xs font-bold leading-4 text-primary-foreground">
              {formatBadgeCount(badgeCount)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CommunityRail({
  communities,
  activeCommunityId,
  onSelectCommunity,
  onOpenProfile,
  onOpenNotifications,
  onOpenFriends,
  onOpenInbox,
  notificationsUnreadCount,
  inboxUnreadCount,
  friendRequestCount,
  onOpenCommunityActions,
  isDmActive = false,
}: CommunityRailProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="w-18 border-r border-border-panel bg-surface-modal">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          alignItems: "center",
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
      >
        {communities.map((community) => {
          const active = community.id === activeCommunityId;

          return (
            <Pressable
              key={community.id}
              onPress={() => onSelectCommunity(community.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${community.name}`}
              className={[
                "h-12 w-12 items-center justify-center rounded-2xl",
                active
                  ? "bg-primary"
                  : "bg-surface-panel active:bg-surface-hover",
              ].join(" ")}
            >
              <Text
                className={[
                  "text-base font-bold",
                  active ? "text-primary-foreground" : "text-foreground",
                ].join(" ")}
              >
                {getCommunityInitial(community.name)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        className="items-center gap-2 border-t border-border-panel pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <RailActionButton
          accessibilityLabel="Notifications"
          icon="notifications-outline"
          badgeCount={notificationsUnreadCount}
          onPress={onOpenNotifications}
        />
        <RailActionButton
          accessibilityLabel="Friends"
          icon="people"
          badgeCount={friendRequestCount}
          onPress={onOpenFriends}
        />
        <RailActionButton
          accessibilityLabel="Direct messages"
          icon="chatbubble-outline"
          badgeCount={inboxUnreadCount}
          isActive={isDmActive}
          onPress={onOpenInbox}
        />
        <RailActionButton
          accessibilityLabel="Open profile"
          icon="person-circle-outline"
          iconSize={25}
          onPress={onOpenProfile}
        />
        <RailActionButton
          accessibilityLabel="Create or join community"
          icon="add"
          onPress={onOpenCommunityActions}
        />
      </View>
    </View>
  );
}
