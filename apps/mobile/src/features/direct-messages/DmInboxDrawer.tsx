import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  type ListRenderItem,
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
import { useHavenCore } from "@mobile-data";
import {
  useCommunities,
  useDmConversations,
  useDmConversationsLoading,
  useFriends,
  useIsLoading,
  usePermissionsByCommunityId,
  useProfilesRecord,
} from "@mobile-data/hooks";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import type {
  DirectMessageConversationSummary,
  FriendSummary,
} from "@shared/lib/backend/types";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { MobileModmailPanel } from "@/features/moderation/MobileModmailPanel";

type DrawerMode = "conversations" | "modmail";

const TOGGLE_BUTTON_SIZE = 36;
const TOGGLE_GAP = 8;
const TOGGLE_STEP = TOGGLE_BUTTON_SIZE + TOGGLE_GAP;

type DmInboxDrawerProps = {
  /** Called after a conversation is opened — signals the shell to close the drawer. */
  onConversationSelected: () => void;
  onStartDirectMessage: (userId: string) => void;
};

export function DmInboxDrawer({
  onConversationSelected,
  onStartDirectMessage,
}: DmInboxDrawerProps) {
  const insets = useSafeAreaInsets();
  const themeTokens = useMobileThemeTokens();
  const foregroundColor =
    resolveColorProp(themeTokens, "foreground") ?? "#e6edf7";
  const core = useHavenCore();
  const dm = core.directMessages;
  const social = core.social;
  const liveProfiles = useProfilesRecord(core.profiles);
  const communities = useCommunities(core.communities);
  const permissionsByCommunityId = usePermissionsByCommunityId(
    core.permissions,
  );

  // ── ModMail availability ────────────────────────────────────────────────
  const modmailCommunityIds = useMemo(
    () =>
      communities
        .filter((c) => permissionsByCommunityId[c.id]?.canManageReports)
        .map((c) => c.id),
    [communities, permissionsByCommunityId],
  );
  const modmailEnabled = modmailCommunityIds.length > 0;

  // ── Mode toggle ─────────────────────────────────────────────────────────
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

  // ── Conversation list data ──────────────────────────────────────────────
  const conversations = useDmConversations(dm);
  const friends = useFriends(social);
  const socialLoading = useIsLoading(social);
  const isLoading = useDmConversationsLoading(dm);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await dm.loadConversations();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load messages."));
    } finally {
      setIsRefreshing(false);
    }
  }, [dm]);

  const openNewDm = useCallback(() => {
    setNewDmOpen(true);
    setError(null);
    void social.ensureLoaded().catch((err) => {
      setError(getErrorMessage(err, "Failed to load friends."));
    });
  }, [social]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setError(null);
      onConversationSelected();
      void dm
        .openConversation(conversationId, { markRead: true })
        .catch((err) => {
          setError(getErrorMessage(err, "Failed to open conversation."));
        });
    },
    [dm, onConversationSelected],
  );

  const getPeerLabel = useCallback(
    (c: DirectMessageConversationSummary) => {
      return (
        resolveLiveUsername(
          liveProfiles,
          c.otherUserId,
          c.otherUsername,
        )?.trim() ||
        c.otherUsername ||
        "Direct"
      );
    },
    [liveProfiles],
  );

  const renderConversation: ListRenderItem<DirectMessageConversationSummary> =
    useCallback(
      ({ item }) => {
        const unread = item.unreadCount > 0;
        const label = getPeerLabel(item);
        const avatarUrl = resolveLiveAvatarUrl(
          liveProfiles,
          item.otherUserId,
          item.otherAvatarUrl,
        );
        const initial = label.slice(0, 1).toUpperCase() || "D";
        return (
          <Pressable
            onPress={() => void handleSelectConversation(item.conversationId)}
            accessibilityRole="button"
            accessibilityLabel={`Open conversation with ${label}`}
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
                className={`text-sm leading-5 ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                numberOfLines={2}
              >
                {label}
              </Text>
              <Text
                className="text-xs leading-4 text-muted-foreground"
                numberOfLines={2}
              >
                {item.lastMessagePreview ?? "No messages yet"}
              </Text>
            </View>
            {unread ? (
              <View className="min-w-6 rounded-full bg-primary px-1.5 py-0.5">
                <Text className="text-center text-xs font-bold leading-4 text-primary-foreground">
                  {item.unreadCount > 99 ? "99+" : String(item.unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      },
      [getPeerLabel, handleSelectConversation],
    );

  const renderFriend: ListRenderItem<FriendSummary> = useCallback(
    ({ item }) => {
      const label =
        resolveLiveUsername(
          liveProfiles,
          item.friendUserId,
          item.username,
        )?.trim() || item.username;
      const avatarUrl = resolveLiveAvatarUrl(
        liveProfiles,
        item.friendUserId,
        item.avatarUrl,
      );
      const initial = label.slice(0, 1).toUpperCase() || "U";

      return (
        <Pressable
          onPress={() => {
            setNewDmOpen(false);
            onConversationSelected();
            onStartDirectMessage(item.friendUserId);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Start direct message with ${label}`}
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
              className="text-sm font-semibold leading-5 text-foreground"
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text
              className="text-xs leading-4 text-muted-foreground"
              numberOfLines={1}
            >
              Start a direct message
            </Text>
          </View>
        </Pressable>
      );
    },
    [liveProfiles, onConversationSelected, onStartDirectMessage],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 border-r border-border-panel bg-surface-modal">
      {/* ── Drawer header ── */}
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
              onPress={openNewDm}
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

          {/* Mode toggle — only shown when user has modmail communities */}
          {modmailEnabled && !newDmOpen ? (
            <View className="relative flex-row items-center">
              {/* Sliding highlight pill */}
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

              {/* Conversations icon */}
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

              {/* ModMail (shield) icon — amber to match existing modmail visual language */}
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

      {/* ── Content area ── */}
      {newDmOpen ? (
        <>
          {error ? (
            <Text className="px-4 pt-2 text-xs text-destructive">{error}</Text>
          ) : null}
          {socialLoading && friends.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={foregroundColor} />
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(friend) => friend.friendUserId}
              renderItem={renderFriend}
              ListEmptyComponent={
                <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Add friends to start a new direct message.
                </Text>
              }
            />
          )}
        </>
      ) : mode === "modmail" ? (
        <MobileModmailPanel managedCommunityIds={modmailCommunityIds} />
      ) : (
        <>
          {error ? (
            <Text className="px-4 pt-2 text-xs text-destructive">{error}</Text>
          ) : null}
          {isLoading && conversations.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={foregroundColor} />
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(c) => c.conversationId}
              renderItem={renderConversation}
              refreshing={isRefreshing}
              onRefresh={() => void handleRefresh()}
              ListEmptyComponent={
                <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No direct messages yet.
                </Text>
              }
            />
          )}
        </>
      )}
    </View>
  );
}
