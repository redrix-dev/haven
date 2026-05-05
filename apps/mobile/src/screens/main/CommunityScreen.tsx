import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
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
import { useServers } from "@shared/features/community/hooks/useServers";
import { useCurrentServerPermissionUi } from "@shared/features/community/hooks/useCurrentServerPermissionUi";
import { getCommunityDataBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@platform/lib/errors";
import { getReplyToMessageId, isAuthorProfileTombstone } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { resolveLiveAvatarUrl } from "@shared/lib/liveProfiles";
import { setLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";
import { CommunityChannelBar } from "@/features/community/CommunityChannelBar";
import { ChatScrollView } from "@/features/community/ChatScrollView";
import {
  CommunityMessageBubble,
  MessageDateDivider,
  dayBucket,
  formatDateDividerLabel,
  formatTime,
  GROUP_WINDOW_MS,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";
import type { AuthorProfile } from "@shared/lib/backend/types";
import { ChannelSwitcherModal } from "@/features/community/ChannelSwitcherModal";
import { CommunityPhaseGate } from "@/features/community/CommunityPhaseGate";
import {
  MessageActionsSheet,
  type MessageActionTarget,
} from "@/features/community/MessageActionsSheet";
import { CommunityReportMessageModal } from "@/features/community/CommunityReportMessageModal";
import { BanUserModal } from "@/features/community/BanUserModal";
import { MobileServerSettingsModal } from "@/features/community/settings/MobileServerSettingsModal";
import { MobileChannelSettingsModal } from "@/features/community/settings/MobileChannelSettingsModal";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import { SafeAreaView } from "react-native-safe-area-context";
// ─── Helpers ──────────────────────────────────────────────────────────────────
const MARGIN = 8;
const COMPOSER_CHROME_IMMERSIVE_OPACITY = 0.38;
const COMPOSER_CHROME_REST_OPACITY = 1;
const COMPOSER_CHROME_IMMERSIVE_MS = 140;
const COMPOSER_CHROME_REST_MS = 280;
const COMPOSER_CHROME_SETTLE_MS = 200;
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

export function CommunityScreen() {
  const { bottom } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const adjustedBlankSpace = useDerivedValue(() => composerHeight.value - bottom);
  const composerChromeOpacity = useSharedValue(COMPOSER_CHROME_REST_OPACITY);
  const listDragRef = useRef(false);
  const listMomentumRef = useRef(false);
  const composerSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const listRef = useRef<FlatList<ChatListItem> | null>(null);

  const clearComposerSettleTimer = useCallback(() => {
    if (composerSettleTimerRef.current != null) {
      clearTimeout(composerSettleTimerRef.current);
      composerSettleTimerRef.current = null;
    }
  }, []);

  const goComposerChromeImmersive = useCallback(() => {
    clearComposerSettleTimer();
    composerChromeOpacity.value = withTiming(COMPOSER_CHROME_IMMERSIVE_OPACITY, {
      duration: COMPOSER_CHROME_IMMERSIVE_MS,
    });
  }, [clearComposerSettleTimer]);

  const scheduleComposerChromeRest = useCallback(() => {
    clearComposerSettleTimer();
    composerSettleTimerRef.current = setTimeout(() => {
      composerSettleTimerRef.current = null;
      if (!listDragRef.current && !listMomentumRef.current) {
        composerChromeOpacity.value = withTiming(COMPOSER_CHROME_REST_OPACITY, {
          duration: COMPOSER_CHROME_REST_MS,
        });
      }
    }, COMPOSER_CHROME_SETTLE_MS);
  }, [clearComposerSettleTimer]);

  useEffect(() => () => clearComposerSettleTimer(), [clearComposerSettleTimer]);

  const composerChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: composerChromeOpacity.value,
  }));

  // ── Auth + navigation store ──
  const communityId = useNavigationStore((state) => state.currentServerId) ?? null;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  const { serverPermissions, canOpenServerSettings } = useCurrentServerPermissionUi(communityId);
  const canOpenChannelSettings =
    serverPermissions.canManageChannelStructure || serverPermissions.canManageChannelPermissions;

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
  const [messageActionsTarget, setMessageActionsTarget] = useState<MessageActionTarget | null>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; username: string } | null>(null);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);

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
  const [isPickingCommunityMedia, setIsPickingCommunityMedia] = useState(false);
  const [pendingCommunityMedia, setPendingCommunityMedia] = useState<CommunityMediaUploadPayload | null>(
    null,
  );
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<string | null>(null);

  const pendingReplyTargetLabel = useMemo(
    () => pendingReplyToMessageId
      ? getReplyTargetLabel(pendingReplyToMessageId, messageById, profiles)
      : null,
    [messageById, pendingReplyToMessageId, profiles],
  );

  const handlePickCommunityMedia = useCallback(async () => {
    if (isSending || isPickingCommunityMedia) return;
    setIsPickingCommunityMedia(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow Photos access to attach images or videos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.85,
        base64: false,
        ...(Platform.OS === "ios"
          ? {
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            }
          : {}),
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const payload = await loadPickedCommunityMediaForUpload(asset);
      setPendingCommunityMedia(payload);
    } catch (e) {
      Alert.alert("Could not add media", getErrorMessage(e, "Choose a different file."));
    } finally {
      setIsPickingCommunityMedia(false);
    }
  }, [isPickingCommunityMedia, isSending]);

  const handleSend = useCallback(async () => {
    const fromInput = composerInputRef.current
      ? await composerInputRef.current.getMarkdown()
      : draft;
    const text = fromInput.trim();
    if (!text && !pendingCommunityMedia) return;
    const replyToMessageId =
      pendingReplyToMessageId && messageById.has(pendingReplyToMessageId)
        ? pendingReplyToMessageId
        : undefined;
    const media = pendingCommunityMedia;
    try {
      setIsSending(true);
      await messaging.actions.sendMessage(text, {
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(media
          ? {
              mediaArrayBuffer: media.body,
              mediaContentType: media.contentType,
              mediaFilename: media.fileName,
            }
          : {}),
      });
      setDraft("");
      composerInputRef.current?.setValue("");
      setPendingCommunityMedia(null);
      setPendingReplyToMessageId(null);
    } catch (e) {
      Alert.alert("Send failed", getErrorMessage(e, "Could not send message."));
    } finally {
      setIsSending(false);
    }
  }, [draft, messageById, messaging.actions, pendingCommunityMedia, pendingReplyToMessageId]);

  const handleReplyToMessage = useCallback((messageId: string) => {
    setPendingReplyToMessageId(messageId);
    (composerInputRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);

  const openMessageActions = useCallback((message: ChatMessage) => {
    setMessageActionsTarget({
      messageId: message.id,
      authorUserId: message.authorUserId ?? null,
      authorName: message.authorName ?? "Unknown",
    });
    setShowMessageActions(true);
  }, []);

  const handleKickFromMessageActions = useCallback(() => {
    if (!communityId || !messageActionsTarget?.authorUserId) return;
    const uid = messageActionsTarget.authorUserId;
    const name = messageActionsTarget.authorName;
    Alert.alert("Kick user", `Remove ${name} from this community?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Kick",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await getCommunityDataBackend(communityId).kickCommunityMember({
                communityId,
                targetUserId: uid,
              });
              Alert.alert("Done", "User was removed from the community.");
            } catch (e) {
              Alert.alert("Failed", getErrorMessage(e, "Could not kick user."));
            }
          })();
        },
      },
    ]);
  }, [communityId, messageActionsTarget]);

  const confirmBanUser = useCallback(
    async (reason: string) => {
      if (!communityId || !banTarget) return;
      await getCommunityDataBackend(communityId).banCommunityMember({
        communityId,
        targetUserId: banTarget.userId,
        reason,
      });
      Alert.alert("Banned", "User has been banned from this community.");
    },
    [banTarget, communityId],
  );

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
        onLongPress={() => openMessageActions(item.message)}
      />
    );
  }, [linkPreviewsByMessageId, composerInputRef, openMessageActions]);

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

  const authorUid = messageActionsTarget?.authorUserId ?? null;
  const canReportOthers =
    Boolean(authorUid) && authorUid !== currentUserId;
  const canKick =
    serverPermissions.canManageMembers &&
    Boolean(authorUid) &&
    authorUid !== currentUserId;
  const canBan =
    serverPermissions.canManageBans && Boolean(authorUid) && authorUid !== currentUserId;

  // ─── Render ───────────────────────────────────────────────────────────────

return (
  <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
    <CommunityChannelBar
      communityName={community?.name ?? "Community"}
      selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
      onPressCommunity={() => {
        if (canOpenServerSettings) setServerSettingsOpen(true);
      }}
      onPressSelectedChannel={() => setIsChannelDropdownOpen(true)}
    />

    <FlatList
      ref={listRef}
      className="flex-1"
      data={chatListItems}
      inverted
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScrollBeginDrag={() => {
        listDragRef.current = true;
        goComposerChromeImmersive();
      }}
      onScrollEndDrag={() => {
        listDragRef.current = false;
        scheduleComposerChromeRest();
      }}
      onMomentumScrollBegin={() => {
        listMomentumRef.current = true;
        goComposerChromeImmersive();
      }}
      onMomentumScrollEnd={() => {
        listMomentumRef.current = false;
        scheduleComposerChromeRest();
      }}
      contentContainerStyle={{ paddingTop: 32 }}
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
      style={{
        position: 'absolute',
        width: '100%',
        bottom: bottom - MARGIN,
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

      {pendingCommunityMedia ? (
        <View className="flex-row items-center gap-2 border-t border-white/[0.08] bg-surface-modal/90 px-3 py-2">
          <Ionicons name="attach" size={16} color="#8b9cbb" />
          <Text className="min-w-0 flex-1 text-xs text-foreground/90" numberOfLines={1}>
            {pendingCommunityMedia.fileName}
          </Text>
          <Pressable
            hitSlop={8}
            disabled={isSending}
            onPress={() => setPendingCommunityMedia(null)}
            className="shrink-0"
          >
            <Text className="text-xs font-semibold text-primary">Remove</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-row items-end bg-transparent px-3 pt-2.5 pb-3 gap-2">
        <Animated.View style={composerChromeAnimatedStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add media"
            disabled={isSending || isPickingCommunityMedia}
            onPress={() => void handlePickCommunityMedia()}
            className="w-[34px] h-[34px] rounded-full bg-white/10 items-center justify-center mb-0.5 disabled:opacity-50"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[{ flex: 1, flexDirection: "row", alignItems: "flex-end" }, composerChromeAnimatedStyle]}
        >
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
            {draft.trim().length > 0 || pendingCommunityMedia != null ? (
              <Pressable
                onPress={() => void handleSend()}
                disabled={isSending}
                className={`w-7 h-7 rounded-full bg-primary items-center justify-center mb-1 ${isSending ? "opacity-55" : ""}`}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </KeyboardStickyView>

    <ChannelSwitcherModal
      visible={isChannelDropdownOpen}
      communityName={community?.name ?? "Community"}
      channels={channels}
      selectedChannelId={currentRenderableChannel?.id ?? null}
      onSelectTextChannel={(channelId) => {
        const ch = channels.find((c) => c.id === channelId);
        if (ch && ch.kind === "text") void handleSelectChannel(ch);
      }}
      onRequestClose={() => setIsChannelDropdownOpen(false)}
      onOpenChannelSettings={
        canOpenChannelSettings
          ? (channelId) => {
              const ch = channels.find((c) => c.id === channelId) ?? null;
              if (ch?.kind === "text") {
                setChannelSettingsChannel(ch);
                setIsChannelDropdownOpen(false);
              }
            }
          : undefined
      }
    />

    <MessageActionsSheet
      visible={showMessageActions}
      onClose={() => setShowMessageActions(false)}
      target={messageActionsTarget}
      communityName={community?.name ?? "Community"}
      canReport={canReportOthers}
      canKick={canKick}
      canBan={canBan}
      onReply={() => {
        if (messageActionsTarget) handleReplyToMessage(messageActionsTarget.messageId);
      }}
      onReport={() => {
        if (messageActionsTarget) setReportMessageId(messageActionsTarget.messageId);
      }}
      onKick={handleKickFromMessageActions}
      onBan={() => {
        if (messageActionsTarget?.authorUserId) {
          setBanTarget({
            userId: messageActionsTarget.authorUserId,
            username: messageActionsTarget.authorName,
          });
        }
      }}
    />

    <CommunityReportMessageModal
      visible={Boolean(reportMessageId)}
      onDismiss={() => setReportMessageId(null)}
      communityName={community?.name ?? "Community"}
      onSubmit={async (input) => {
        if (!reportMessageId) return;
        await messaging.actions.reportMessage({
          messageId: reportMessageId,
          ...input,
        });
      }}
    />

    <BanUserModal
      visible={Boolean(banTarget)}
      username={banTarget?.username ?? ""}
      onDismiss={() => setBanTarget(null)}
      onConfirm={confirmBanUser}
    />

    <MobileServerSettingsModal
      visible={serverSettingsOpen}
      onDismiss={() => setServerSettingsOpen(false)}
      communityId={communityId}
      communityName={community?.name ?? "Community"}
      currentUserId={currentUserId}
      canManageServer={serverPermissions.canManageServer}
      canManageRoles={serverPermissions.canManageRoles}
      canManageMembers={serverPermissions.canManageMembers}
      canManageBans={serverPermissions.canManageBans}
      canManageInvites={serverPermissions.canManageInvites}
      refreshServers={refreshServers}
    />

    <MobileChannelSettingsModal
      visible={Boolean(channelSettingsChannel)}
      onDismiss={() => setChannelSettingsChannel(null)}
      communityId={communityId}
      channel={channelSettingsChannel}
      currentUserId={currentUserId}
      canManageChannelStructure={serverPermissions.canManageChannelStructure}
      canManageChannelPermissions={serverPermissions.canManageChannelPermissions}
    />
  </SafeAreaView>
  
  );
};