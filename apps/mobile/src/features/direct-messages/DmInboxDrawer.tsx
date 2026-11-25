import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
// uniwind-theme-allow mobile-theme/no-direct-ionicons - Ionicons kept for amber shield icon (ModMail brand color has no semantic token)
import { Ionicons } from "@expo/vector-icons";
import { ThemedIonicons } from "@/theme-rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  conversations as conversationList,
  isMuted,
  otherPerson,
  unreadCount,
} from "@shared/collections/channels/selectors";
import { latestMessage } from "@shared/collections/messages/selectors";
import { friendIds } from "@shared/collections/social/selectors";
import { answered } from "@shared/collections/kit/requests";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveColorProp } from "@shared/themes";
import {
  useAvatarUrl,
  useCore,
  useHavenCore,
  useMe,
  useNameOf,
  useStore,
} from "@mobile-data";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { MobileModmailPanel } from "@/features/moderation/MobileModmailPanel";

type DrawerMode = "conversations" | "modmail";

const TOGGLE_BUTTON_SIZE = 36;
const TOGGLE_GAP = 8;
const TOGGLE_STEP = TOGGLE_BUTTON_SIZE + TOGGLE_GAP;

type DmInboxDrawerProps = {
  /** Called after a conversation is opened — signals the shell to close the drawer. */
  onConversationSelected: () => void;
};

export function DmInboxDrawer({ onConversationSelected }: DmInboxDrawerProps) {
  const insets = useSafeAreaInsets();
  const themeTokens = useMobileThemeTokens();
  const foregroundColor =
    resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const core = useHavenCore();
  const me = useMe() ?? "";

  // ModMail: the communities whose reports the person handles.
  const modmailCommunityIds = useCore(["communities"], (s) =>
    Object.keys(s.communities.byId).filter((id) =>
      s.communities.permissions[id]?.includes("manage_reports"),
    ),
  );
  const modmailEnabled = modmailCommunityIds.length > 0;

  const [mode, setMode] = useState<DrawerMode>("conversations");
  const [newDmOpen, setNewDmOpen] = useState(false);
  const indicatorOffset = useSharedValue(0);

  const handleModeSwitch = useCallback(
    (nextMode: DrawerMode) => {
      setMode(nextMode);
      indicatorOffset.value = withTiming(
        nextMode === "conversations" ? 0 : TOGGLE_STEP,
        { duration: 180 },
      );
    },
    [indicatorOffset],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorOffset.value }],
  }));

  const conversationIds = useStore("channels", (s) =>
    conversationList(s).map((c) => c.id),
  );
  const conversationsLoaded = useStore("channels", (s) =>
    answered(s.requests, "conversations"),
  );
  const conversationsError = useStore(
    "channels",
    (s) => s.requests.conversations?.error ?? null,
  );
  const friends = useStore("social", (s) => friendIds(s, me));
  const [refreshing, setRefreshing] = useState(false);

  // The people and the newest message of every conversation listed.
  useEffect(() => {
    const channels = core.stores.channels.getState();
    const people = conversationIds
      .map((id) => otherPerson(channels, id, me))
      .filter((id): id is string => id !== null);
    void core.profiles.ensure(people);
    if (conversationIds.length > 0)
      void core.messages.loadLatest(conversationIds);
  }, [conversationIds, core, me]);

  useEffect(() => {
    if (newDmOpen) void core.profiles.ensure(friends);
  }, [core, friends, newDmOpen]);

  const refresh = async () => {
    setRefreshing(true);
    await core.channels.loadConversations();
    setRefreshing(false);
  };

  const openConversation = (channelId: string) => {
    onConversationSelected();
    void core.openConversation(channelId);
  };

  const startWith = async (userId: string) => {
    try {
      await core.openConversationWith(userId);
      setNewDmOpen(false);
      onConversationSelected();
    } catch (error) {
      Alert.alert(
        "Couldn't start a conversation",
        getErrorMessage(error, "Try again in a moment."),
      );
    }
  };

  return (
    <View className="flex-1 border-r border-border-panel bg-surface-modal">
      <View
        className="border-b border-border-panel px-4 pb-3"
        style={{ paddingTop: insets.top + 16 }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">
            {newDmOpen
              ? "New message"
              : mode === "modmail"
                ? "ModMail"
                : "Messages"}
          </Text>

          {newDmOpen ? (
            <Pressable
              onPress={() => setNewDmOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to messages"
              className="h-9 w-9 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
            >
              <ThemedIonicons
                name="arrow-back"
                size={18}
                colorClassName="accent-foreground"
              />
            </Pressable>
          ) : mode === "conversations" ? (
            <Pressable
              onPress={() => setNewDmOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Start new direct message"
              className="h-9 w-9 items-center justify-center rounded-xl bg-surface-panel active:bg-surface-hover"
            >
              <ThemedIonicons
                name="add"
                size={20}
                colorClassName="accent-foreground"
              />
            </Pressable>
          ) : null}

          {modmailEnabled && !newDmOpen ? (
            <View className="relative flex-row items-center">
              <Animated.View
                style={[{ position: "absolute", left: 0 }, indicatorStyle]}
                pointerEvents="none"
              >
                <View
                  style={{
                    width: TOGGLE_BUTTON_SIZE,
                    height: TOGGLE_BUTTON_SIZE,
                  }}
                  className="rounded-xl bg-surface-hover"
                />
              </Animated.View>
              <Pressable
                onPress={() => handleModeSwitch("conversations")}
                accessibilityRole="button"
                accessibilityLabel="View conversations"
                accessibilityState={{ selected: mode === "conversations" }}
                style={{
                  width: TOGGLE_BUTTON_SIZE,
                  height: TOGGLE_BUTTON_SIZE,
                }}
                className="items-center justify-center rounded-xl"
              >
                <ThemedIonicons
                  name="chatbubble-outline"
                  size={18}
                  colorClassName={
                    mode === "conversations"
                      ? "accent-foreground"
                      : "accent-muted-foreground"
                  }
                />
              </Pressable>
              <View style={{ width: TOGGLE_GAP }} />
              <Pressable
                onPress={() => handleModeSwitch("modmail")}
                accessibilityRole="button"
                accessibilityLabel="View ModMail"
                accessibilityState={{ selected: mode === "modmail" }}
                style={{
                  width: TOGGLE_BUTTON_SIZE,
                  height: TOGGLE_BUTTON_SIZE,
                }}
                className="items-center justify-center rounded-xl"
              >
                {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - amber is intentional ModMail brand color; muted fallback uses border-panel */}
                <Ionicons
                  name="shield-outline"
                  size={18}
                  color={mode === "modmail" ? "#fbbf24" : "#6b7fa0"}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {newDmOpen ? (
        <FlatList
          data={friends}
          keyExtractor={(id) => id}
          renderItem={({ item }) => (
            <PersonRow
              userId={item}
              subtitle="Start a conversation"
              onPress={() => void startWith(item)}
            />
          )}
          ListEmptyComponent={
            <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
              Add friends to start a conversation. Anyone whose settings allow
              it can also be messaged from their profile.
            </Text>
          }
        />
      ) : mode === "modmail" ? (
        <MobileModmailPanel managedCommunityIds={modmailCommunityIds} />
      ) : !conversationsLoaded && conversationIds.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          {conversationsError ? (
            <Text className="text-center text-sm text-destructive">
              {getErrorMessage(conversationsError, "Failed to load messages.")}
            </Text>
          ) : (
            <ActivityIndicator color={foregroundColor} />
          )}
        </View>
      ) : (
        <FlatList
          data={conversationIds}
          keyExtractor={(id) => id}
          renderItem={({ item }) => (
            <ConversationRow
              channelId={item}
              onPress={() => openConversation(item)}
            />
          )}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ListEmptyComponent={
            <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
              No conversations yet.
            </Text>
          }
        />
      )}
    </View>
  );
}

function ConversationRow({
  channelId,
  onPress,
}: {
  channelId: string;
  onPress: () => void;
}) {
  const me = useMe() ?? "";
  const peerId = useStore("channels", (s) => otherPerson(s, channelId, me));
  const unread = useStore("channels", (s) =>
    isMuted(s, channelId) ? 0 : unreadCount(s, channelId),
  );
  const preview = useStore(
    "messages",
    (s) => latestMessage(s, channelId)?.body ?? null,
  );
  return (
    <PersonRow
      userId={peerId ?? ""}
      subtitle={preview ?? "No messages yet"}
      unread={unread}
      onPress={onPress}
    />
  );
}

function PersonRow({
  userId,
  subtitle,
  unread = 0,
  onPress,
}: {
  userId: string;
  subtitle: string;
  unread?: number;
  onPress: () => void;
}) {
  const label = useNameOf(userId);
  const avatarUrl = useAvatarUrl(userId);
  const initial = label.slice(0, 1).toUpperCase() || "?";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0
          ? `${label}, ${unread} unread`
          : `Open conversation with ${label}`
      }
      className="flex-row items-center gap-3 border-b border-border-panel px-4 py-3 active:bg-surface-hover"
    >
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 40, height: 40 }}
            resizeMode="cover"
            accessibilityLabel={`${label} avatar`}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text className="text-base font-semibold text-foreground">
            {initial}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className={`text-sm leading-5 ${unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          className="text-xs leading-4 text-muted-foreground"
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      {unread > 0 ? (
        <View className="min-w-6 rounded-full bg-primary px-1.5 py-0.5">
          <Text className="text-center text-xs font-bold leading-4 text-primary-foreground">
            {unread > 99 ? "99+" : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
