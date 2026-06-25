import { CommonActions, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "@/navigation/types";
import { ThemedIonicons, type ThemedIoniconsProps } from "@/theme-rn";

type HavenNavbarProps = {
  onPressSettings?: () => void;
  onPressNotifications?: () => void;
  /** Filtered inbox unread (excludes DMs + friend-request kinds); drives badge + bell pulse. */
  notificationsUnreadCount?: number;
  /** Sum of DM conversation unread counts from `dmStore`. */
  dmUnreadCount?: number;
  /** Incoming pending friend requests (`socialCounts.incomingPendingRequestCount`). */
  friendRequestCount?: number;
  onPressDirectMessages?: () => void;
  onPressFriends?: () => void;
};

const goCommunityEntry = (
  navigation: NativeStackNavigationProp<RootStackParamList>,
) =>
  navigation.dispatch(
    CommonActions.navigate({
      name: "Main",
      params: { screen: "CommunityEntry" },
    }),
  );

function NotificationsBellButton({
  unreadCount,
  onPress,
}: {
  unreadCount: number;
  onPress: () => void;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (unreadCount > 0) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(0, { duration: 220 });
    }
  }, [unreadCount]);

  const bellAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.06 }],
    opacity: 0.88 + pulse.value * 0.12,
  }));

  return (
    <Animated.View style={bellAnimatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
        onPress={onPress}
      >
        <View>
          <ThemedIonicons
            name="notifications-outline"
            size={22}
            colorClassName="accent-foreground"
          />
          {unreadCount > 0 ? (
            <View className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent-slider px-1 py-0.5">
              <Text className="text-center text-xs font-bold leading-4 text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function IconWithBadge({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  return (
    <View>
      {children}
      {count > 0 ? (
        <View className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent-slider px-1 py-0.5">
          <Text className="text-center text-xs font-bold leading-4 text-primary-foreground">
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function HavenNavbar({
  onPressSettings,
  onPressNotifications,
  notificationsUnreadCount = 0,
  dmUnreadCount = 0,
  friendRequestCount = 0,
  onPressDirectMessages,
  onPressFriends,
}: HavenNavbarProps) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const iconBtn = (name: ThemedIoniconsProps["name"], onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
      onPress={onPress}
    >
      <ThemedIonicons
        name={name}
        size={22}
        colorClassName="accent-foreground"
      />
    </Pressable>
  );

  return (
    <View
      className="border-b border-border-panel bg-surface-modal"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-row items-center justify-between px-3 pb-3">
        <View className="z-10 flex-row gap-2">
          {iconBtn("chevron-back", () => {
            if (navigation.canGoBack()) navigation.goBack();
            else goCommunityEntry(navigation);
          })}
          {iconBtn("home", () => goCommunityEntry(navigation))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              friendRequestCount > 0
                ? `Friends, ${friendRequestCount} pending requests`
                : "Friends"
            }
            className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
            onPress={onPressFriends ?? (() => undefined)}
          >
            <IconWithBadge count={friendRequestCount}>
              <ThemedIonicons
                name="people"
                size={22}
                colorClassName="accent-foreground"
              />
            </IconWithBadge>
          </Pressable>
        </View>
        <Text className="absolute left-0 right-0 text-center text-lg font-semibold text-foreground">
          Haven
        </Text>
        <View className="z-10 flex-row gap-2">
          {onPressNotifications ? (
            <NotificationsBellButton
              unreadCount={notificationsUnreadCount}
              onPress={onPressNotifications}
            />
          ) : (
            iconBtn("notifications-outline", () => undefined)
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              dmUnreadCount > 0
                ? `Direct messages, ${dmUnreadCount} unread`
                : "Direct messages"
            }
            className="h-11 w-11 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
            onPress={onPressDirectMessages ?? (() => undefined)}
          >
            <IconWithBadge count={dmUnreadCount}>
              <ThemedIonicons
                name="chatbubble-outline"
                size={22}
                colorClassName="accent-foreground"
              />
            </IconWithBadge>
          </Pressable>
          {iconBtn("cog-outline", onPressSettings ?? (() => undefined))}
        </View>
      </View>
    </View>
  );
}
