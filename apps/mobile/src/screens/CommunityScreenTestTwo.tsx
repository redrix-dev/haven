import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { Ionicons } from "@expo/vector-icons";
import type { Channel, Message, MessageAttachment, MessageLinkPreview } from "@shared/lib/backend/types";
import { useAuthStore } from "@shared/stores/authStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useServers } from "@shared/features/community/hooks/useServers";
import { getReplyToMessageId, isAuthorProfileTombstone } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { resolveLiveAvatarUrl } from "@shared/lib/liveProfiles";
import { setLastTextChannelIdForCommunity } from "../storage/communityChannelPrefs";
import { CommunityChannelBar } from "../components/community/CommunityChannelBar";
import { ChatScrollView } from "../components/community/ChatScrollView";
import {
  CommunityMessageBubble,
  MessageDateDivider,
  dayBucket,
  formatDateDividerLabel,
  formatTime,
  GROUP_WINDOW_MS,
  type ChatListItem,
  type ChatMessage,
} from "../components/community/CommunityMessageBubble";
import type { AuthorProfile } from "@shared/lib/backend/types";
import { ChannelSwitcherModal } from "@/components/community/ChannelSwitcherModal";
import { CommunityPhaseGate } from "@/components/community/CommunityPhaseGate";
import { SafeAreaView } from "react-native-safe-area-context";
// ─── Helpers ──────────────────────────────────────────────────────────────────
const MARGIN = 8;
function getReplyTargetLabel(
  replyToId: string | null,
  messageById: Map<string, Message>,
  profiles: Record<string, AuthorProfile>,
): string | null {
  if (!replyToId) return null;
  const parent = messageById.get(replyToId);
  if (!parent) return "a message";
  if (parent.author_type === "haven_dev") return "Haven Moderation Team";
  if (parent.author_type === "system") return "System";
  const uid = parent.author_user_id;
  if (!uid) return "a message";
  const profile = profiles[uid];
  if (profile?.username) return profile.username;
  return uid.slice(0, 12);
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CommunityScreenTestTwo() {
  const { bottom } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const adjustedBlankSpace = useDerivedValue(() => composerHeight.value - bottom);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const listRef = useRef<FlatList<ChatListItem> | null>(null);

  // ── Auth + navigation store ──
  const communityId = useNavigationStore((state) => state.currentServerId) ?? null;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  // ── Servers + workspace ──
  const { servers, status: serversStatus, error: serversError, refreshServers } = useServers();
  const {
    state: { channels },
    derived: { currentRenderableChannel },
  } = useCommunityWorkspace({ servers, currentUserId });

  // ── Messaging ──
  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: currentRenderableChannel?.id ?? null,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });

  // ── Stores ──
  const storedMessages = useMessagesStore((state) => state.messages);
  const profiles = useMessagesStore((state) => state.profiles);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const attachmentRecord = useMessagesStore((state) => state.attachments);
  const linkPreviewRecord = useMessagesStore((state) => state.linkPreviews);
  usePermissionsStore((state) => state.getPermissions(communityId ?? ""));

  // ── Derived data ──
  const community = useMemo(
    () => (communityId ? servers.find((s) => s.id === communityId) ?? null : null),
    [communityId, servers],
  );

  

  const attachmentsByMessageId = useMemo(() => {
    const grouped: Record<string, MessageAttachment[]> = {};
    for (const attachment of Object.values(attachmentRecord)) {
      const list = grouped[attachment.messageId] ?? [];
      list.push(attachment);
      grouped[attachment.messageId] = list;
    }
    return grouped;
  }, [attachmentRecord]);

  const linkPreviewsByMessageId = useMemo(() => {
    const grouped: Record<string, MessageLinkPreview | null> = {};
    for (const preview of Object.values(linkPreviewRecord)) {
      grouped[preview.messageId] = preview;
    }
    return grouped;
  }, [linkPreviewRecord]);

  const messageById = useMemo(
    () => new Map(storedMessages.map((m) => [m.id, m] as const)),
    [storedMessages],
  );

  const messages = useMemo<ChatMessage[]>(() => {
    return [...storedMessages].reverse().map((message: Message) => {
      const cachedProfile =
        message.author_user_id != null ? (profiles[message.author_user_id] ?? null) : null;
      const preserveTombstone = isAuthorProfileTombstone(cachedProfile ?? undefined);
      const liveAvatar =
        message.author_user_id != null && !preserveTombstone
          ? resolveLiveAvatarUrl(liveProfiles, message.author_user_id, cachedProfile?.avatarUrl ?? null)
          : (cachedProfile?.avatarUrl ?? null);
      const authorName =
        message.author_type === "haven_dev"
          ? "Haven Moderation Team"
          : message.author_type === "system"
            ? "System"
            : (cachedProfile?.username ?? message.author_user_id?.slice(0, 12) ?? "Unknown User");

      return {
        id: message.id,
        text: message.content,
        createdAt: message.created_at,
        authorUserId: message.author_user_id ?? null,
        authorName,
        authorInitial: authorName.trim().charAt(0).toUpperCase() || "U",
        authorAvatarUrl: liveAvatar,
        isAuthorStaff: Boolean(message.author_type === "user" && cachedProfile?.isPlatformStaff),
        timestampLabel: formatTime(message.created_at),
        replyTargetLabel: getReplyTargetLabel(getReplyToMessageId(message), messageById, profiles),
        attachments: attachmentsByMessageId[message.id] ?? [],
      };
    });
  }, [attachmentsByMessageId, liveProfiles, messageById, profiles, storedMessages]);

  const chatListItems = useMemo<ChatListItem[]>(() => {
    const items: ChatListItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const prev = messages[i + 1];
      const currentBucket = dayBucket(message.createdAt);
      const prevBucket = dayBucket(prev?.createdAt);
      const shouldInsertDivider = currentBucket !== prevBucket;
      const isSameDayAsPrev = Boolean(currentBucket) && currentBucket === prevBucket;
      const isSameAuthor = Boolean(message.authorUserId) && message.authorUserId === prev?.authorUserId;
      const currentTs = message.createdAt ? Date.parse(message.createdAt) : NaN;
      const prevTs = prev?.createdAt ? Date.parse(prev.createdAt) : NaN;
      const hasValidTs = Number.isFinite(currentTs) && Number.isFinite(prevTs);
      const isCloseInTime = hasValidTs ? Math.abs(currentTs - prevTs) <= GROUP_WINDOW_MS : false;

      items.push({
        kind: "message",
        message,
        isCondensed: isSameAuthor && isCloseInTime && isSameDayAsPrev,
      });

      if (shouldInsertDivider) {
        items.push({
          kind: "divider",
          id: `divider-${message.id}`,
          label: formatDateDividerLabel(message.createdAt ?? new Date().toISOString()),
        });
      }
    }
    return items;
  }, [messages]);

  // ── Channel resolution ──
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  const handleSelectChannel = useCallback(
    async (channel: Channel) => {
      if (!communityId) return;
      setCurrentChannelId(channel.id);
      await setLastTextChannelIdForCommunity(communityId, channel.id);
      setIsChannelDropdownOpen(false);
    },
    [communityId, setCurrentChannelId],
  );

  // ── Composer state ──
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<string | null>(null);

  const pendingReplyTargetLabel = useMemo(
    () => pendingReplyToMessageId
      ? getReplyTargetLabel(pendingReplyToMessageId, messageById, profiles)
      : null,
    [messageById, pendingReplyToMessageId, profiles],
  );

  const handleSend = useCallback(async () => {
    const fromInput = composerInputRef.current
      ? await composerInputRef.current.getMarkdown()
      : draft;
    const text = fromInput.trim();
    if (!text) return;
    const replyToMessageId =
      pendingReplyToMessageId && messageById.has(pendingReplyToMessageId)
        ? pendingReplyToMessageId
        : undefined;
    try {
      setIsSending(true);
      await messaging.actions.sendMessage(
        text,
        replyToMessageId ? { replyToMessageId } : undefined,
      );
      setDraft("");
      composerInputRef.current?.setValue("");
      setPendingReplyToMessageId(null);
    } finally {
      setIsSending(false);
    }
  }, [draft, messageById, messaging.actions, pendingReplyToMessageId]);

  const handleReplyToMessage = useCallback((messageId: string) => {
    setPendingReplyToMessageId(messageId);
    (composerInputRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);

  // ── renderScrollComponent ──
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} blankSpace={adjustedBlankSpace} />
    ),
    [adjustedBlankSpace],
  );

  const renderChatItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.kind === "divider") {
      return <MessageDateDivider label={item.label} />;
    }
    
    return (
      <CommunityMessageBubble
        {...item.message}
        attachments={item.message.attachments ?? []}
        isCondensed={item.isCondensed}
        linkPreview={linkPreviewsByMessageId[item.message.id] ?? null}
        onPress={() => composerInputRef.current?.blur()}
        onLongPress={() => handleReplyToMessage(item.message.id)}
      />
    );
  }, [linkPreviewsByMessageId, composerInputRef, handleReplyToMessage]);

  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";
  const phaseGate = <CommunityPhaseGate phase={phase} error={serversError} onRetry={refreshServers} />;
  if (phase !== "ready") return phaseGate;

  

  
  // ─── Render ───────────────────────────────────────────────────────────────

return (
  <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
    <CommunityChannelBar
      communityName={community?.name ?? "Community"}
      selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
      onPressCommunity={() => undefined}
      onPressSelectedChannel={() => setIsChannelDropdownOpen(true)}
      onPressCreateChannel={() => undefined}
    />

    <FlatList
      ref={listRef}
      className="flex-1"
      data={chatListItems}
      inverted
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: 8 }}
      keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
      renderItem={renderChatItem}
      renderScrollComponent={renderScrollComponent}
      onEndReachedThreshold={0.3}
      onEndReached={() => {
        if (messaging.state.hasOlderMessages && !messaging.state.isLoadingOlderMessages) {
          void messaging.actions.requestOlderMessages();
        }
      }}
      ListEmptyComponent={
        <View className="items-center pt-8">
          <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
        </View>
      }
      ListFooterComponent={
        messaging.state.isLoadingOlderMessages ? (
          <View className="py-2.5">
            <ActivityIndicator color="#e6edf7" />
          </View>
        ) : null
      }
    />

    <KeyboardStickyView
      offset={{ opened: bottom - MARGIN }}
      onLayout={(e) => {
        composerHeight.value = e.nativeEvent.layout.height;
      }}
    >
      {pendingReplyToMessageId ? (
        <View className="flex-row items-center justify-between bg-surface-modal px-3 py-2 border-t border-white/[0.08]">
          <Text className="text-foreground/80 text-xs shrink mr-2.5">
            Replying to {pendingReplyTargetLabel ?? "a message"}
          </Text>
          <Pressable hitSlop={8} onPress={() => setPendingReplyToMessageId(null)}>
            <Text className="text-primary text-xs font-semibold">Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row items-end bg-transparent px-3 pt-2.5 pb-3 gap-2">
        <Pressable className="w-[34px] h-[34px] rounded-full bg-white/10 items-center justify-center mb-0.5">
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>

        <View className="flex-1 flex-row items-end rounded-[18px] border border-white/10 bg-white/[0.08] pr-1">
          <EnrichedMarkdownTextInput
            ref={composerInputRef}
            multiline
            editable={!isSending}
            scrollEnabled
            defaultValue=""
            onChangeMarkdown={setDraft}
            placeholder="Type a message..."
            placeholderTextColor="#8e8e93"
            cursorColor="#e6edf7"
            selectionColor="rgba(63, 121, 216, 0.4)"
            markdownStyle={{
              strong: { color: "#e6edf7" },
              em: { color: "#e6edf7" },
              link: { color: "#3F79D8", underline: true },
              spoiler: { color: "#a9b8cf", backgroundColor: "rgba(0,0,0,0.2)" },
            }}
            style={{
              flex: 1,
              minHeight: 36,
              maxHeight: 120,
              color: "#e6edf7",
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 8,
              fontSize: 16,
              backgroundColor: "transparent",
            }}
          />
          {draft.trim().length > 0 ? (
            <Pressable
              onPress={() => void handleSend()}
              disabled={isSending}
              className={`w-7 h-7 rounded-full bg-primary items-center justify-center mb-1 ${isSending ? "opacity-55" : ""}`}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </KeyboardStickyView>

    <ChannelSwitcherModal
      visible={isChannelDropdownOpen}
      communityName={community?.name ?? "Community"}
      channels={channels}
      selectedChannelId={currentRenderableChannel?.id ?? null}
      onSelectChannel={channelId => {
        const channel = channels.find(c => c.id === channelId);
        if (channel) void handleSelectChannel(channel);
      }}
      onRequestClose={() => setIsChannelDropdownOpen(false)}
      onCreateChannel={() => undefined}
    />
  </SafeAreaView>
  );
};