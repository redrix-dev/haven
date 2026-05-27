import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View, type ListRenderItem } from "react-native";
// uniwind-theme-allow mobile-theme/no-direct-ionicons - Ionicons kept for amber shield icon (ModMail brand color has no semantic token)
import { Ionicons } from "@expo/vector-icons";
import { ThemedIonicons } from "@/theme-rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHavenCore } from "@shared/core";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import type { DirectMessageConversationSummary } from "@shared/lib/backend/types";
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
  const core = useHavenCore();
  const dm = core.directMessages;
  const liveProfiles = core.profiles.useProfilesRecord();
  const communities = core.communities.useCommunities();
  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();

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
  const conversations = dm.useConversations();
  const isLoading = dm.useIsLoadingConversations();
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

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setError(null);
      try {
        await dm.openConversation(conversationId, { markRead: true });
        onConversationSelected();
      } catch (err) {
        setError(getErrorMessage(err, "Failed to open conversation."));
      }
    },
    [dm, onConversationSelected],
  );

  const getPeerLabel = useCallback(
    (c: DirectMessageConversationSummary) => {
      return (
        resolveLiveUsername(liveProfiles, c.otherUserId, c.otherUsername)?.trim() ||
        c.otherUsername ||
        "Direct"
      );
    },
    [liveProfiles],
  );

  const renderConversation: ListRenderItem<DirectMessageConversationSummary> = useCallback(
    ({ item }) => {
      const unread = item.unreadCount > 0;
      const label = getPeerLabel(item);
      return (
        <Pressable
          onPress={() => void handleSelectConversation(item.conversationId)}
          accessibilityRole="button"
          accessibilityLabel={`Open conversation with ${label}`}
          className="flex-row items-center gap-3 border-b border-border-panel px-4 py-3 active:bg-surface-hover"
        >
          <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
            <Text className="text-base font-semibold text-foreground">
              {label.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className={`text-sm ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {item.lastMessagePreview ?? "No messages yet"}
            </Text>
          </View>
          {unread ? (
            <View className="min-w-[20px] rounded-full bg-primary px-1.5 py-0.5">
              <Text className="text-center text-[10px] font-bold text-primary-foreground">
                {item.unreadCount > 99 ? "99+" : String(item.unreadCount)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [getPeerLabel, handleSelectConversation],
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
            {mode === "modmail" ? "ModMail" : "Messages"}
          </Text>

          {/* Mode toggle — only shown when user has modmail communities */}
          {modmailEnabled ? (
            <View className="relative flex-row items-center">
              {/* Sliding highlight pill */}
              <Animated.View
                style={[{ position: "absolute", left: 0 }, indicatorStyle]}
                pointerEvents="none"
              >
                <View
                  style={{ width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
                  className="rounded-xl bg-surface-hover"
                />
              </Animated.View>

              {/* Conversations icon */}
              <Pressable
                onPress={() => handleModeSwitch("conversations")}
                accessibilityRole="button"
                accessibilityLabel="View conversations"
                accessibilityState={{ selected: mode === "conversations" }}
                style={{ width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
                className="items-center justify-center rounded-xl"
              >
                <ThemedIonicons
                  name="chatbubble-outline"
                  size={18}
                  colorClassName={mode === "conversations" ? "accent-foreground" : "accent-muted-foreground"}
                />
              </Pressable>

              <View style={{ width: TOGGLE_GAP }} />

              {/* ModMail (shield) icon — amber to match existing modmail visual language */}
              <Pressable
                onPress={() => handleModeSwitch("modmail")}
                accessibilityRole="button"
                accessibilityLabel="View ModMail"
                accessibilityState={{ selected: mode === "modmail" }}
                style={{ width: TOGGLE_BUTTON_SIZE, height: TOGGLE_BUTTON_SIZE }}
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
      {mode === "modmail" ? (
        <MobileModmailPanel managedCommunityIds={modmailCommunityIds} />
      ) : (
        <>
          {error ? (
            <Text className="px-4 pt-2 text-xs text-destructive">{error}</Text>
          ) : null}
          {isLoading && conversations.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              {/* uniwind-theme-allow mobile-theme/no-raw-color-prop - ActivityIndicator requires raw color; resolves to --foreground */}
              <ActivityIndicator color="#e6edf7" />
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
