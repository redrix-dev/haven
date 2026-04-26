import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ViewToken,
  View,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  KeyboardChatScrollView,
  KeyboardGestureArea,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useAuthStore } from "@shared/stores/authStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useServers } from "@shared/features/community/hooks/useServers";
import type {
  AuthorProfile,
  Channel,
  Message,
  MessageAttachment,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import type { MessageLinkPreview } from "@shared/lib/backend/types";
import { getFallbackEmbedUrl } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { getReplyToMessageId } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { isAuthorProfileTombstone } from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { resolveLiveAvatarUrl } from "@shared/lib/liveProfiles";
import { CommunityAttachmentVideo } from "../components/community/CommunityAttachmentVideo";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import {
  getLastTextChannelIdForCommunity,
  setLastTextChannelIdForCommunity,
} from "../storage/communityChannelPrefs";
import { commitChannelScrollExit, peekChannelScrollExit } from "../storage/communityTimelinePrefs";

// EDIT START: add local message model/constants for standalone in-line screen
type ChatMessage = {
  id: string;
  text: string;
  authorName?: string;
  authorInitial?: string;
  authorAvatarUrl?: string | null;
  isAuthorStaff?: boolean;
  timestampLabel?: string;
  replyTargetLabel?: string | null;
  attachments?: MessageAttachment[];
};
type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;
const INPUT_HEIGHT = 42;
const INITIAL_MESSAGES: ChatMessage[] = [];
const DEV_LIST_VISUAL_TOP_BREATHING = 8;
const MESSAGE_JUMP_THRESHOLD = 220;

function resolveMimeType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  if (asset.type === "video") return "video/mp4";
  return "image/jpeg";
}

function formatTime(timestamp: string): string {
  const value = new Date(timestamp);
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

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
// EDIT END: local message model/constants for standalone in-line screen

// EDIT START: wrapper for virtualized list keyboard behavior
const ChatScrollView = forwardRef<Ref, ScrollViewProps & KeyboardChatScrollViewProps>(
  (props, ref) => {
    const { bottom } = useSafeAreaInsets();

    return (
      <KeyboardChatScrollView
        ref={ref}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        offset={bottom - MARGIN}
        {...props}
      />
    );
  },
);
// EDIT END: wrapper for virtualized list keyboard behavior

// EDIT START: local in-line message bubble renderer
function Message({
  id,
  text,
  authorName,
  authorInitial,
  authorAvatarUrl,
  isAuthorStaff,
  timestampLabel,
  replyTargetLabel,
  attachments,
  onPress,
  onLongPress,
  linkPreview,
}: ChatMessage & {
  onPress?: () => void;
  onLongPress?: () => void;
  linkPreview?: MessageLinkPreview | null;
}) {
  // EDIT START: inline link preview parity computations
  const embedUrl = linkPreview ? getFallbackEmbedUrl(linkPreview) : null;
  const sourceUrl = linkPreview?.sourceUrl ?? linkPreview?.snapshot?.sourceUrl ?? "";
  const title = linkPreview?.snapshot?.title ?? sourceUrl;
  const siteName = linkPreview?.snapshot?.siteName ?? "Link preview";
  const thumbnailUrl = linkPreview?.snapshot?.thumbnail?.signedUrl ?? null;
  // EDIT END: inline link preview parity computations

  return (
    <Pressable style={styles.messageRow} onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.messageBubble}>
        <View style={styles.messageMetaRow}>
          <View style={styles.messageAvatarShell}>
            {authorAvatarUrl ? (
              <Image
                source={{ uri: authorAvatarUrl }}
                style={styles.messageAvatarImage}
                resizeMode="cover"
                accessibilityLabel={`${authorName ?? "User"} avatar`}
              />
            ) : (
              <View style={styles.messageAvatarFallback}>
                <Text style={styles.messageAvatarFallbackText}>{authorInitial ?? "U"}</Text>
              </View>
            )}
          </View>
          <View style={styles.messageMetaNameRow}>
            <Text style={styles.messageAuthorName} numberOfLines={1}>
              {authorName ?? "Unknown User"}
            </Text>
            {isAuthorStaff ? (
              <View style={styles.messageStaffBadge}>
                <Text style={styles.messageStaffBadgeText}>Staff</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.messageTimestamp}>{timestampLabel ?? ""}</Text>
        </View>
        {replyTargetLabel ? (
          <Text style={styles.messageReplyLabel}>Replying to {replyTargetLabel}</Text>
        ) : null}
        <EnrichedMarkdownText
          markdown={text}
          md4cFlags={{ underline: true }}
          markdownStyle={{
            paragraph: { color: "#e6edf7", fontSize: 14, lineHeight: 20 },
            h1: {
              fontSize: 22,
              fontWeight: "700",
              color: "#e6edf7",
              marginTop: 4,
              marginBottom: 4,
              lineHeight: 28,
            },
            h2: {
              fontSize: 18,
              fontWeight: "700",
              color: "#e6edf7",
              marginTop: 4,
              marginBottom: 4,
              lineHeight: 24,
            },
            h3: {
              fontSize: 16,
              fontWeight: "600",
              color: "#e6edf7",
              marginTop: 4,
              marginBottom: 2,
              lineHeight: 22,
            },
            strong: { color: "#e6edf7" },
            em: { color: "#e6edf7" },
            code: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: "#1a2235",
              color: "#e6edf7",
              borderColor: "#1a2235",
            },
            codeBlock: {
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 13,
              backgroundColor: "#1a2235",
              color: "#e6edf7",
              padding: 10,
              borderRadius: 6,
              marginTop: 4,
              marginBottom: 4,
            },
            blockquote: {
              backgroundColor: "#1a2235",
              borderColor: "#3F79D8",
              borderWidth: 3,
              gapWidth: 10,
              marginTop: 2,
              marginBottom: 2,
            },
            strikethrough: { color: "#e6edf7" },
            list: { marginTop: 2, marginBottom: 2 },
            link: { color: "#3F79D8", underline: true },
          }}
          onLinkPress={({ url }) => {
            void Linking.openURL(url);
          }}
        />
        {/* EDIT START: inline attachment rendering parity after markdown body */}
        {attachments?.map((attachment) => {
          if (!attachment.signedUrl) {
            return (
              <Text key={attachment.id} style={styles.attachmentUnavailableText}>
                Attachment unavailable.
              </Text>
            );
          }
          if (attachment.mediaKind === "image") {
            return (
              <Image
                key={attachment.id}
                source={{ uri: attachment.signedUrl }}
                style={styles.attachmentImage}
                resizeMode="cover"
              />
            );
          }
          if (attachment.mediaKind === "video") {
            return (
              <CommunityAttachmentVideo
                key={attachment.id}
                uri={attachment.signedUrl}
                style={styles.attachmentVideo}
              />
            );
          }
          return (
            <Pressable
              key={attachment.id}
              onPress={() => {
                if (attachment.signedUrl) {
                  void Linking.openURL(attachment.signedUrl);
                }
              }}
              style={styles.attachmentFileRow}
            >
              <Text style={styles.attachmentFileLabel}>
                {attachment.originalFilename ?? "Open attachment"}
              </Text>
            </Pressable>
          );
        })}
        {/* EDIT END: inline attachment rendering parity after markdown body */}
        {/* EDIT START: inline preview card under markdown body */}
        {linkPreview ? (
          <Pressable
            key={`${id}-preview`}
            onPress={() => {
              if (sourceUrl) {
                void Linking.openURL(sourceUrl);
              }
            }}
            style={styles.linkPreviewCard}
          >
            <Text style={styles.linkPreviewSite}>{siteName}</Text>
            <Text style={styles.linkPreviewTitle}>{title}</Text>
            {thumbnailUrl ? (
              <Image
                source={{ uri: thumbnailUrl }}
                style={styles.linkPreviewImage}
                resizeMode="cover"
              />
            ) : null}
            {embedUrl ? (
              <Text style={styles.linkPreviewHint}>Video preview available - tap to open.</Text>
            ) : null}
          </Pressable>
        ) : null}
        {/* EDIT END: inline preview card under markdown body */}
      </View>
    </Pressable>
  );
}
// EDIT END: local in-line message bubble renderer

// EDIT START: export as CommunityScreen to wire directly in navigation
export function CommunityScreen() {
  // EDIT START: slice 1 real message source context from production hooks
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Home">>();
  const communityId = useNavigationStore((state) => state.currentServerId) ?? null;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;
  // EDIT START: slice 5 reliability state inputs from server loading lifecycle
  const { servers, status: serversStatus, error: serversError, refreshServers } = useServers();
  // EDIT END: slice 5 reliability state inputs from server loading lifecycle
  const {
    state: { channels },
    derived: { currentRenderableChannel },
  } = useCommunityWorkspace({
    servers,
    currentUserId,
  });
  // EDIT START: slice 2 keep hook handle for send action
  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: currentRenderableChannel?.id ?? null,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });
  // EDIT END: slice 2 keep hook handle for send action
  const storedMessages = useMessagesStore((state) => state.messages);
  const profiles = useMessagesStore((state) => state.profiles);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const attachmentRecord = useMessagesStore((state) => state.attachments);
  const linkPreviewRecord = useMessagesStore((state) => state.linkPreviews);
  // EDIT END: slice 1 real message source context from production hooks

  // EDIT START: derive attachments by message id for inline rendering
  const attachmentsByMessageId = useMemo(() => {
    const grouped: Record<string, MessageAttachment[]> = {};
    for (const attachment of Object.values(attachmentRecord)) {
      const list = grouped[attachment.messageId] ?? [];
      list.push(attachment);
      grouped[attachment.messageId] = list;
    }
    return grouped;
  }, [attachmentRecord]);
  // EDIT END: derive attachments by message id for inline rendering

  // EDIT START: derive link previews by message id for inline rendering
  const linkPreviewsByMessageId = useMemo(() => {
    const grouped: Record<string, MessageLinkPreview | null> = {};
    for (const preview of Object.values(linkPreviewRecord)) {
      grouped[preview.messageId] = preview;
    }
    return grouped;
  }, [linkPreviewRecord]);
  // EDIT END: derive link previews by message id for inline rendering

  // EDIT START: slice 5 derive simple reliability phase gates
  const community = useMemo(
    () => (communityId ? servers.find((entry) => entry.id === communityId) ?? null : null),
    [communityId, servers],
  );
  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";
  // EDIT END: slice 5 derive simple reliability phase gates

  // EDIT START: slice 4 channel context resolution and dev-only dropdown state
  const textChannels = useMemo(
    () => channels.filter((channel) => channel.kind === "text"),
    [channels],
  );
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  // EDIT START: slice 6 measured top chrome footprint for viewport boundary
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  // EDIT END: slice 6 measured top chrome footprint for viewport boundary

  useEffect(() => {
    let cancelled = false;
    if (!communityId) return;

    const resolveInitialTextChannel = async () => {
      const activeTextChannel =
        currentRenderableChannel && currentRenderableChannel.kind === "text"
          ? currentRenderableChannel
          : null;
      if (activeTextChannel) {
        await setLastTextChannelIdForCommunity(communityId, activeTextChannel.id);
        return;
      }

      if (textChannels.length === 0) {
        setCurrentChannelId(null);
        await setLastTextChannelIdForCommunity(communityId, null);
        return;
      }

      const storedChannelId = await getLastTextChannelIdForCommunity(communityId);
      const storedChannel = textChannels.find((channel) => channel.id === storedChannelId);
      const nextChannel = storedChannel ?? textChannels[0];
      if (cancelled) return;
      setCurrentChannelId(nextChannel.id);
      await setLastTextChannelIdForCommunity(communityId, nextChannel.id);
    };

    void resolveInitialTextChannel();
    return () => {
      cancelled = true;
    };
  }, [communityId, currentRenderableChannel, setCurrentChannelId, textChannels]);

  const handleSelectChannel = useCallback(
    async (channel: Channel) => {
      if (!communityId) return;
      setCurrentChannelId(channel.id);
      await setLastTextChannelIdForCommunity(communityId, channel.id);
      setIsChannelDropdownOpen(false);
    },
    [communityId, setCurrentChannelId],
  );
  const handleCloseChannelDropdown = useCallback(() => {
    setIsChannelDropdownOpen(false);
  }, []);
  const handleOpenChannelDropdown = useCallback(() => {
    setIsChannelDropdownOpen(true);
  }, []);
  // EDIT END: slice 4 channel context resolution and dev-only dropdown state

  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const [draft, setDraft] = useState("");
  // EDIT START: slice 2 minimal send-loading state for real send pipeline
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  // EDIT END: slice 2 minimal send-loading state for real send pipeline
  // EDIT START: composer media affordance pending attachment state
  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [reportDialogMessageId, setReportDialogMessageId] = useState<string | null>(
    null,
  );
  const [reportTarget, setReportTarget] = useState<MessageReportTarget>("haven_staff");
  const [reportKind, setReportKind] = useState<MessageReportKind>("content_abuse");
  const [reportComment, setReportComment] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<string | null>(
    null,
  );
  const [showJumpToNewest, setShowJumpToNewest] = useState(false);
  const nearBottomRef = useRef(true);
  const mountedNearBottomRef = useRef(true);
  const topVisibleMessageIdRef = useRef<string | null>(null);
  const scrollOffsetYRef = useRef(0);
  const scrollIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreAppliedChannelKeyRef = useRef<string | null>(null);
  const jumpHintPlayedRef = useRef<string | null>(null);
  const jumpOpacity = useRef(new Animated.Value(0)).current;
  const jumpScale = useRef(new Animated.Value(1)).current;
  // EDIT END: composer media affordance pending attachment state
  // EDIT START: keep local send behavior while hydrating list from real store
  const [localMessages, setLocalMessages] = useState(INITIAL_MESSAGES);
  const messageById = useMemo(
    () => new Map(storedMessages.map((message) => [message.id, message] as const)),
    [storedMessages],
  );
  const messages = useMemo<ChatMessage[]>(() => {
    const localIds = new Set(localMessages.map((message) => message.id));
    const hydratedMessagesNewestFirst = [...storedMessages]
      .reverse()
      .map((message: Message) => {
        const cachedProfile =
          message.author_user_id != null ? (profiles[message.author_user_id] ?? null) : null;
        const preserveTombstone = isAuthorProfileTombstone(cachedProfile ?? undefined);
        const liveAvatar =
          message.author_user_id != null && !preserveTombstone
            ? resolveLiveAvatarUrl(
                liveProfiles,
                message.author_user_id,
                cachedProfile?.avatarUrl ?? null,
              )
            : (cachedProfile?.avatarUrl ?? null);
        const authorName =
          message.author_type === "haven_dev"
            ? "Haven Moderation Team"
            : message.author_type === "system"
              ? "System"
              : (cachedProfile?.username ??
                message.author_user_id?.slice(0, 12) ??
                "Unknown User");

        return {
          id: message.id,
          text: message.content,
          authorName,
          authorInitial: authorName.trim().charAt(0).toUpperCase() || "U",
          authorAvatarUrl: liveAvatar,
          isAuthorStaff: Boolean(
            message.author_type === "user" && cachedProfile?.isPlatformStaff,
          ),
          timestampLabel: formatTime(message.created_at),
          replyTargetLabel: getReplyTargetLabel(
            getReplyToMessageId(message),
            messageById,
            profiles,
          ),
          attachments: attachmentsByMessageId[message.id] ?? [],
        };
      })
      .filter((message) => !localIds.has(message.id));
    return [...localMessages, ...hydratedMessagesNewestFirst];
  }, [
    attachmentsByMessageId,
    liveProfiles,
    localMessages,
    messageById,
    profiles,
    storedMessages,
  ]);
  const pendingReplyTargetLabel = useMemo(
    () =>
      pendingReplyToMessageId
        ? getReplyTargetLabel(pendingReplyToMessageId, messageById, profiles)
        : null,
    [messageById, pendingReplyToMessageId, profiles],
  );
  const textChannelId = currentRenderableChannel?.kind === "text" ? currentRenderableChannel.id : null;
  const scrollExitPeek = useMemo(() => {
    if (!communityId || !textChannelId) return null;
    return peekChannelScrollExit(communityId, textChannelId);
  }, [communityId, textChannelId]);
  const jumpHintFromExit = useMemo(() => {
    if (!textChannelId || messages.length === 0) return false;
    if (
      !scrollExitPeek ||
      scrollExitPeek.wasNearBottom !== false ||
      !scrollExitPeek.anchorMessageId ||
      scrollExitPeek.anchorMessageId.trim().length === 0
    ) {
      return false;
    }
    return messages.some((entry) => entry.id === scrollExitPeek.anchorMessageId);
  }, [messages, scrollExitPeek, textChannelId]);
  // EDIT END: keep local send behavior while hydrating list from real store
  const { bottom, top } = useSafeAreaInsets();
  // EDIT START: align top chrome + list padding with safe-area notch
  const topChromeTopInset = top + 8;
  const topChromeOccupiedHeight = topChromeHeight > 0 ? topChromeHeight : top + 108;
  const devVisualTopPaddingBottom = __DEV__ ? DEV_LIST_VISUAL_TOP_BREATHING : 0;
  // EDIT END: align top chrome + list padding with safe-area notch
  const extraContentPadding = useSharedValue(0);

  const setJumpFullyVisible = useCallback(() => {
    Animated.timing(jumpOpacity, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [jumpOpacity]);

  const fadeJumpToIdle = useCallback(() => {
    Animated.timing(jumpOpacity, {
      toValue: 0.45,
      duration: 220,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [jumpOpacity]);

  useEffect(() => {
    return () => {
      if (scrollIdleTimeoutRef.current) clearTimeout(scrollIdleTimeoutRef.current);
    };
  }, []);

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} extraContentPadding={extraContentPadding} />
    ),
    [extraContentPadding],
  );

  // EDIT START: slice 2 swap local append send to real messaging send action
  const onSend = useCallback(async () => {
    const fromInput = composerInputRef.current ? await composerInputRef.current.getMarkdown() : draft;
    const text = fromInput.trim();
    if (!text && !pendingAttachment) return;
    const replyToMessageId =
      pendingReplyToMessageId && messageById.has(pendingReplyToMessageId)
        ? pendingReplyToMessageId
        : undefined;

    try {
      setIsSendingMessage(true);
      if (!pendingAttachment) {
        await messaging.actions.sendMessage(
          text,
          replyToMessageId ? { replyToMessageId } : undefined,
        );
      } else {
        const response = await fetch(pendingAttachment.uri);
        const blob = await response.blob();
        const file = new File([blob], pendingAttachment.fileName, {
          type: pendingAttachment.mimeType,
        });
        await messaging.actions.sendMessage(
          text,
          replyToMessageId
            ? { replyToMessageId, mediaFile: file }
            : { mediaFile: file },
        );
      }
      setDraft("");
      composerInputRef.current?.setValue("");
      setPendingAttachment(null);
      setPendingReplyToMessageId(null);
    } finally {
      setIsSendingMessage(false);
    }
  }, [draft, messageById, messaging.actions, pendingAttachment, pendingReplyToMessageId]);
  // EDIT END: slice 2 swap local append send to real messaging send action

  const onInputLayout = useCallback(
    (e: LayoutChangeEvent) => {
      extraContentPadding.value = withTiming(
        Math.max(e.nativeEvent.layout.height - INPUT_HEIGHT, 0),
        { duration: 250 },
      );
    },
    [extraContentPadding],
  );

  useEffect(() => {
    nearBottomRef.current = true;
    mountedNearBottomRef.current = true;
    topVisibleMessageIdRef.current = null;
    scrollOffsetYRef.current = 0;
    restoreAppliedChannelKeyRef.current = null;
    if (!textChannelId) return;
    return () => {
      if (!communityId || !textChannelId) return;
      if (mountedNearBottomRef.current) {
        commitChannelScrollExit(communityId, textChannelId, {
          wasNearBottom: true,
          anchorMessageId: null,
          anchorOffsetY: 0,
        });
        return;
      }
      const anchorMessageId = topVisibleMessageIdRef.current;
      if (!anchorMessageId) {
        commitChannelScrollExit(communityId, textChannelId, {
          wasNearBottom: true,
          anchorMessageId: null,
          anchorOffsetY: 0,
        });
        return;
      }
      commitChannelScrollExit(communityId, textChannelId, {
        wasNearBottom: false,
        anchorMessageId,
        anchorOffsetY: scrollOffsetYRef.current,
      });
    };
  }, [communityId, textChannelId]);

  useEffect(() => {
    const channelKey = communityId && textChannelId ? `${communityId}:${textChannelId}` : null;
    if (!channelKey || !listRef.current || messages.length === 0) return;
    if (restoreAppliedChannelKeyRef.current === channelKey) return;
    restoreAppliedChannelKeyRef.current = channelKey;

    const canRestore =
      scrollExitPeek &&
      scrollExitPeek.wasNearBottom === false &&
      typeof scrollExitPeek.anchorOffsetY === "number" &&
      Number.isFinite(scrollExitPeek.anchorOffsetY) &&
      scrollExitPeek.anchorOffsetY > 0;

    if (canRestore) {
      listRef.current.scrollToOffset({ offset: scrollExitPeek.anchorOffsetY ?? 0, animated: false });
      nearBottomRef.current = false;
      mountedNearBottomRef.current = false;
      setShowJumpToNewest(true);
      return;
    }

    listRef.current.scrollToOffset({ offset: 0, animated: false });
    nearBottomRef.current = true;
    mountedNearBottomRef.current = true;
    setShowJumpToNewest(false);
  }, [communityId, messages, scrollExitPeek, textChannelId]);

  useEffect(() => {
    if (!textChannelId) return;
    setShowJumpToNewest(jumpHintFromExit);
  }, [jumpHintFromExit, textChannelId]);

  useEffect(() => {
    if (!showJumpToNewest || !textChannelId) return;
    const key = `${communityId ?? "none"}:${textChannelId}`;
    if (jumpHintPlayedRef.current === key) return;
    jumpHintPlayedRef.current = key;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(jumpOpacity, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(jumpScale, {
            toValue: 1.08,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(jumpScale, {
            toValue: 1,
            duration: 120,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(jumpOpacity, {
        toValue: 0.45,
        duration: 260,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [communityId, jumpOpacity, jumpScale, showJumpToNewest, textChannelId]);

  const handleScrollMessages = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollOffsetYRef.current = offsetY;
      const nearBottom = offsetY <= MESSAGE_JUMP_THRESHOLD;
      nearBottomRef.current = nearBottom;
      mountedNearBottomRef.current = nearBottom;
      setShowJumpToNewest(!nearBottom);
      if (!nearBottom) {
        setJumpFullyVisible();
        if (scrollIdleTimeoutRef.current) clearTimeout(scrollIdleTimeoutRef.current);
        scrollIdleTimeoutRef.current = setTimeout(() => {
          fadeJumpToIdle();
          scrollIdleTimeoutRef.current = null;
        }, 280);
      }
    },
    [fadeJumpToIdle, setJumpFullyVisible],
  );

  const onViewableItemsChanged = useRef(
    (info: { viewableItems: Array<ViewToken<ChatMessage>> }) => {
      const firstVisible = info.viewableItems.find((entry) => entry.isViewable && entry.item);
      if (firstVisible?.item?.id) topVisibleMessageIdRef.current = firstVisible.item.id;
    },
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 10,
      minimumViewTime: 80,
    }),
    [],
  );

  const handleJumpToNewest = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    nearBottomRef.current = true;
    mountedNearBottomRef.current = true;
    setShowJumpToNewest(false);
  }, []);

  // EDIT START: slice 6 inline parity top chrome action handlers
  const handleOpenCommunitySettings = useCallback(() => {
    navigation.navigate("SettingsPlaceholder");
  }, [navigation]);

  const handleOpenCreateChannel = useCallback(() => {
    return;
  }, []);
  // EDIT END: slice 6 inline parity top chrome action handlers

  // EDIT START: composer media action affordance parity handlers
  const handleAttach = useCallback(async () => {
    if (isSendingMessage) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled) return;
    const first = result.assets[0];
    if (!first?.uri) return;
    setPendingAttachment({
      uri: first.uri,
      fileName: first.fileName ?? `upload-${Date.now()}`,
      mimeType: resolveMimeType(first),
    });
  }, [isSendingMessage]);

  const showComposerActionSheet = useCallback(() => {
    if (isSendingMessage) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Add media"], cancelButtonIndex: 0 },
        (buttonIndex) => {
          if (buttonIndex === 1) void handleAttach();
        },
      );
      return;
    }
    Alert.alert("", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Add media", onPress: () => void handleAttach() },
    ]);
  }, [handleAttach, isSendingMessage]);
  // EDIT END: composer media action affordance parity handlers

  // EDIT START: long-press message actions parity handlers
  const handleReplyToMessage = useCallback((messageId: string) => {
    setPendingReplyToMessageId(messageId);
    (
      composerInputRef.current as unknown as { focus?: () => void } | null
    )?.focus?.();
  }, []);

  const handleReportMessage = useCallback((messageId: string) => {
    setReportDialogMessageId(messageId);
    setReportTarget("haven_staff");
    setReportKind("content_abuse");
    setReportComment("");
    setReportError(null);
  }, []);

  const handleLongPressMessage = useCallback(
    (messageId: string) => {
      if (Platform.OS !== "ios") {
        Alert.alert("Message actions", "Choose an action for this message.", [
          { text: "Reply", onPress: () => handleReplyToMessage(messageId) },
          { text: "Report", onPress: () => handleReportMessage(messageId) },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      const actions = ["Reply", "Report", "Cancel"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: actions,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) handleReplyToMessage(messageId);
          if (index === 1) handleReportMessage(messageId);
        },
      );
    },
    [handleReplyToMessage, handleReportMessage],
  );
  // EDIT END: long-press message actions parity handlers

  const handleSubmitMessageReport = useCallback(async () => {
    if (!reportDialogMessageId || reportSubmitting) return;
    try {
      setReportSubmitting(true);
      setReportError(null);
      await messaging.actions.reportMessage({
        messageId: reportDialogMessageId,
        target: reportTarget,
        kind: reportKind,
        comment: reportComment.trim(),
      });
      setReportDialogMessageId(null);
      setReportComment("");
    } catch (error) {
      const fallback = "Failed to submit message report.";
      setReportError(error instanceof Error ? error.message : fallback);
    } finally {
      setReportSubmitting(false);
    }
  }, [
    messaging.actions,
    reportComment,
    reportDialogMessageId,
    reportKind,
    reportSubmitting,
    reportTarget,
  ]);

  const handleCloseMessageReport = useCallback(() => {
    setReportDialogMessageId(null);
    setReportTarget("haven_staff");
    setReportKind("content_abuse");
    setReportComment("");
    setReportSubmitting(false);
    setReportError(null);
  }, []);

  useEffect(() => {
    if (!pendingReplyToMessageId) return;
    if (messageById.has(pendingReplyToMessageId)) return;
    setPendingReplyToMessageId(null);
  }, [messageById, pendingReplyToMessageId]);

  useEffect(() => {
    if (!reportDialogMessageId) return;
    if (messageById.has(reportDialogMessageId)) return;
    handleCloseMessageReport();
  }, [handleCloseMessageReport, messageById, reportDialogMessageId]);

  // EDIT START: slice 5 lightweight reliability wrappers
  if (phase === "loading") {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.stateContainer}>
          <ActivityIndicator color="#e6edf7" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>{serversError ?? "Unable to load community data."}</Text>
          <Pressable onPress={() => void refreshServers()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === "missing") {
    return (
      <SafeAreaView edges={["bottom"]} style={styles.container}>
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>Community not available.</Text>
          <Pressable onPress={() => void refreshServers()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  // EDIT END: slice 5 lightweight reliability wrappers

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <KeyboardGestureArea
        interpolator="ios"
        offset={INPUT_HEIGHT}
        style={styles.container}
        textInputNativeID="chat-input"
      >
        {/* EDIT START: strict list viewport boundary under dev bar */}
        <View
          style={[
            styles.listViewport,
            { top: topChromeOccupiedHeight },
          ]}
        >
          <FlatList
            ref={listRef}
            data={messages}
            inverted
            keyboardShouldPersistTaps="handled"
            onScroll={handleScrollMessages}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig}
            // EDIT START: add bottom spacing so top dev bar doesn't clip oldest message access
            contentContainerStyle={{
              paddingTop: 10,
              paddingBottom: devVisualTopPaddingBottom,
            }}
            // EDIT END: add bottom spacing so top dev bar doesn't clip oldest message access
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Message
                {...item}
                attachments={item.attachments ?? []}
                linkPreview={linkPreviewsByMessageId[item.id] ?? null}
                onPress={() => {
                  composerInputRef.current?.blur();
                }}
                onLongPress={() => {
                  handleLongPressMessage(item.id);
                }}
              />
            )}
            renderScrollComponent={renderScrollComponent}
            // EDIT START: slice 3 older-message pagination using messaging state/actions
            onEndReachedThreshold={0.3}
            onEndReached={() => {
              if (messaging.state.hasOlderMessages && !messaging.state.isLoadingOlderMessages) {
                void messaging.actions.requestOlderMessages();
              }
            }}
            ListFooterComponent={
              messaging.state.isLoadingOlderMessages ? (
                <View style={styles.paginationFooter}>
                  <ActivityIndicator color="#e6edf7" />
                </View>
              ) : null
            }
            // EDIT END: slice 3 older-message pagination using messaging state/actions
          />
          <KeyboardStickyView offset={{ opened: bottom - MARGIN }} style={styles.composer}>
            {showJumpToNewest ? (
              <Animated.View
                style={[
                  styles.jumpToNewestWrapper,
                  { opacity: jumpOpacity, transform: [{ scale: jumpScale }] },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={handleJumpToNewest}
                  style={styles.jumpToNewestButton}
                >
                  <Text style={styles.jumpToNewestText}>Jump to latest</Text>
                </Pressable>
              </Animated.View>
            ) : null}
            {pendingReplyToMessageId ? (
              <View style={styles.replyBanner}>
                <Text style={styles.replyBannerText}>
                  Replying to {pendingReplyTargetLabel ?? "a message"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setPendingReplyToMessageId(null)}
                >
                  <Text style={styles.replyBannerCancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerInputRow}>
              <Pressable
                accessibilityLabel="Message options"
                accessibilityRole="button"
                hitSlop={8}
                disabled={isSendingMessage}
                onPress={showComposerActionSheet}
                style={styles.composerOptionsButton}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color="#a9b8cf" />
              </Pressable>
              <View style={styles.inputShell} onLayout={onInputLayout}>
                <EnrichedMarkdownTextInput
                  ref={composerInputRef}
                  multiline
                  editable={!isSendingMessage}
                  scrollEnabled
                  defaultValue=""
                  onChangeMarkdown={setDraft}
                  placeholder="Type a message..."
                  placeholderTextColor="#a9b8cf"
                  cursorColor="#e6edf7"
                  selectionColor="rgba(63, 121, 216, 0.4)"
                  markdownStyle={{
                    strong: { color: "#e6edf7" },
                    em: { color: "#e6edf7" },
                    link: { color: "#3F79D8", underline: true },
                    spoiler: { color: "#a9b8cf", backgroundColor: "rgba(0,0,0,0.2)" },
                  }}
                  style={styles.input}
                />
              </View>
              <TouchableOpacity
                onPress={() => void onSend()}
                style={[styles.sendButton, isSendingMessage && styles.sendButtonDisabled]}
                disabled={isSendingMessage}
              >
                <Text style={styles.sendButtonText}>{isSendingMessage ? "..." : "Send"}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardStickyView>
        </View>
        {/* EDIT END: strict list viewport boundary under dev bar */}
        {/* EDIT START: slice 6 inline top chrome parity for haven + channel controls */}
        <View
          style={[styles.topChromeContainer, { paddingTop: topChromeTopInset }]}
          onLayout={(event) => {
            const measuredHeight = event.nativeEvent.layout.height;
            if (measuredHeight !== topChromeHeight) {
              setTopChromeHeight(measuredHeight);
            }
          }}
        >
          <View style={styles.havenNavbarShell}>
            <View style={styles.havenNavbarRow}>
              <View style={styles.havenNavbarActionsLeft}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.havenIconButton}
                  onPress={() => {
                    if (navigation.canGoBack()) navigation.goBack();
                  }}
                >
                  <Ionicons name="chevron-back" size={22} color="#e6edf7" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.havenIconButton}
                  onPress={() => navigation.navigate("Home")}
                >
                  <Ionicons name="home" size={22} color="#e6edf7" />
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.havenIconButton} onPress={() => undefined}>
                  <Ionicons name="people" size={22} color="#e6edf7" />
                </Pressable>
              </View>
              <Text style={styles.havenNavbarTitle}>Haven</Text>
              <View style={styles.havenNavbarActionsRight}>
                <Pressable accessibilityRole="button" style={styles.havenIconButton} onPress={() => undefined}>
                  <Ionicons name="notifications-outline" size={22} color="#e6edf7" />
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.havenIconButton} onPress={() => undefined}>
                  <Ionicons name="chatbubble-outline" size={22} color="#e6edf7" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.havenIconButton}
                  onPress={handleOpenCommunitySettings}
                >
                  <Ionicons name="cog-outline" size={22} color="#e6edf7" />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.channelBarShell}>
            <Pressable
              accessibilityRole="button"
              style={styles.channelBarCommunityPressable}
              onPress={handleOpenCommunitySettings}
            >
              <Text style={styles.channelBarCommunityText} numberOfLines={1}>
                {community?.name ?? "Community"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.channelBarSelectedChannelPressable}
              onPress={handleOpenChannelDropdown}
            >
              <Text style={styles.channelBarHash}>#</Text>
              <Text style={styles.channelBarSelectedChannelText} numberOfLines={1}>
                {currentRenderableChannel?.name ?? "Select channel"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#a9b8cf" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.channelBarCreateButton}
              onPress={handleOpenCreateChannel}
            >
              <Ionicons name="add" size={18} color="#e6edf7" />
            </Pressable>
          </View>
        </View>
        {/* EDIT END: slice 6 inline top chrome parity for haven + channel controls */}
        <Modal
          visible={isChannelDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={handleCloseChannelDropdown}
        >
          <View style={styles.channelModalOverlay}>
            <Pressable
              style={styles.channelModalBackdrop}
              onPress={handleCloseChannelDropdown}
            />
            <View style={styles.channelModalCard}>
              <View style={styles.channelModalHeader}>
                <Text style={styles.channelModalTitle}>Select channel</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleCloseChannelDropdown}
                  hitSlop={8}
                >
                  <Text style={styles.channelModalCloseText}>Close</Text>
                </Pressable>
              </View>
              <View style={styles.channelModalOptions}>
                {textChannels.map((channel) => (
                  <Pressable
                    key={channel.id}
                    onPress={() => {
                      void handleSelectChannel(channel);
                    }}
                    style={styles.channelModalOption}
                  >
                    <Text
                      style={[
                        styles.channelModalOptionText,
                        currentRenderableChannel?.id === channel.id &&
                          styles.channelModalOptionTextActive,
                      ]}
                    >
                      # {channel.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.channelModalActions}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.channelModalCreateButton}
                  onPress={() => {
                    handleCloseChannelDropdown();
                    handleOpenCreateChannel();
                  }}
                >
                  <Text style={styles.channelModalCreateButtonText}>Create channel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        {reportDialogMessageId ? (
          <View style={styles.reportOverlay}>
            <Pressable
              style={styles.reportOverlayBackdrop}
              onPress={handleCloseMessageReport}
            />
            <KeyboardStickyView offset={{ opened: bottom + 8, closed: 0 }}>
              <View style={styles.reportCard}>
            <Text style={styles.reportTitle}>Report Message</Text>
            <Text style={styles.reportSubtitle}>
              Route this report to moderators with the same metadata used on desktop.
            </Text>

            <Text style={styles.reportFieldLabel}>Who should the report go to?</Text>
            <View style={styles.reportChoiceGroup}>
              <Pressable
                onPress={() => setReportTarget("haven_staff")}
                style={[
                  styles.reportChoice,
                  reportTarget === "haven_staff" && styles.reportChoiceActive,
                ]}
              >
                <Text style={styles.reportChoiceText}>Haven Moderation</Text>
              </Pressable>
              <Pressable
                onPress={() => setReportTarget("server_admins")}
                style={[
                  styles.reportChoice,
                  reportTarget === "server_admins" && styles.reportChoiceActive,
                ]}
              >
                <Text style={styles.reportChoiceText}>
                  Report to {community?.name ?? "Community"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setReportTarget("both")}
                style={[
                  styles.reportChoice,
                  reportTarget === "both" && styles.reportChoiceActive,
                ]}
              >
                <Text style={styles.reportChoiceText}>Both</Text>
              </Pressable>
            </View>

            <Text style={styles.reportFieldLabel}>Type</Text>
            <View style={styles.reportChoiceGroup}>
              <Pressable
                onPress={() => setReportKind("content_abuse")}
                style={[
                  styles.reportChoice,
                  reportKind === "content_abuse" && styles.reportChoiceActive,
                ]}
              >
                <Text style={styles.reportChoiceText}>Report Content Abuse</Text>
              </Pressable>
              <Pressable
                onPress={() => setReportKind("bug")}
                style={[
                  styles.reportChoice,
                  reportKind === "bug" && styles.reportChoiceActive,
                ]}
              >
                <Text style={styles.reportChoiceText}>Report Bug</Text>
              </Pressable>
            </View>

            <Text style={styles.reportFieldLabel}>Comment</Text>
            <TextInput
              value={reportComment}
              onChangeText={setReportComment}
              maxLength={1000}
              multiline
              placeholder="Add context for moderators (optional)."
              placeholderTextColor="#9ba9bf"
              style={styles.reportCommentInput}
              editable={!reportSubmitting}
            />

            {reportError ? <Text style={styles.reportErrorText}>{reportError}</Text> : null}

            <View style={styles.reportActionsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={handleCloseMessageReport}
                disabled={reportSubmitting}
                style={styles.reportCancelButton}
              >
                <Text style={styles.reportCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleSubmitMessageReport()}
                disabled={reportSubmitting}
                style={[
                  styles.reportSubmitButton,
                  reportSubmitting && styles.reportSubmitButtonDisabled,
                ]}
              >
                <Text style={styles.reportSubmitButtonText}>
                  {reportSubmitting ? "Submitting..." : "Submit report"}
                </Text>
              </Pressable>
            </View>
              </View>
            </KeyboardStickyView>
          </View>
        ) : null}
      </KeyboardGestureArea>
    </SafeAreaView>
  );
}
// EDIT END: export as CommunityScreen to wire directly in navigation

// EDIT START: local styles for fully in-line chat screen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  messageRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  messageBubble: {
    alignSelf: "stretch",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#1F2937",
  },
  messageMetaRow: {
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  messageAvatarShell: {
    marginRight: 8,
    height: 24,
    width: 24,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  messageAvatarImage: {
    width: "100%",
    height: "100%",
  },
  messageAvatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messageAvatarFallbackText: {
    color: "#E5E7EB",
    fontSize: 11,
    fontWeight: "600",
  },
  messageMetaNameRow: {
    marginRight: 6,
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  messageAuthorName: {
    flexShrink: 1,
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "600",
  },
  messageStaffBadge: {
    borderRadius: 4,
    backgroundColor: "rgba(63, 121, 216, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  messageStaffBadgeText: {
    color: "#3F79D8",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  messageTimestamp: {
    flexShrink: 0,
    color: "#9ba9bf",
    fontSize: 11,
  },
  messageReplyLabel: {
    marginBottom: 6,
    color: "#9ba9bf",
    fontSize: 12,
  },
  messageText: {
    color: "#E5E7EB",
    fontSize: 14,
    lineHeight: 20,
  },
  linkPreviewCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#101722",
    padding: 12,
  },
  linkPreviewSite: {
    fontSize: 12,
    color: "#9ba9bf",
  },
  linkPreviewTitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: "#e6edf7",
  },
  linkPreviewImage: {
    width: "100%",
    height: 150,
    borderRadius: 10,
    marginTop: 8,
  },
  linkPreviewHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#3F79D8",
  },
  attachmentUnavailableText: {
    marginTop: 8,
    color: "#9ba9bf",
    fontSize: 12,
  },
  attachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
  },
  attachmentVideo: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
  },
  attachmentFileRow: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: "#1a2235",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentFileLabel: {
    color: "#3F79D8",
    fontSize: 14,
    fontWeight: "500",
  },
  composer: {
    marginHorizontal: MARGIN,
    marginBottom: MARGIN,
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 8,
    gap: 8,
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerOptionsButton: {
    alignSelf: "center",
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    backgroundColor: "#1a2235",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replyBannerText: {
    color: "#D1D5DB",
    fontSize: 12,
    flexShrink: 1,
    marginRight: 10,
  },
  replyBannerCancel: {
    color: "#3F79D8",
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    minHeight: INPUT_HEIGHT,
    maxHeight: 120,
    color: "#F9FAFB",
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
    fontSize: 15,
    lineHeight: 22,
  },
  inputShell: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#1F2937",
    paddingHorizontal: 6,
  },
  sendButton: {
    height: INPUT_HEIGHT,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  // EDIT START: slice 2 disabled send button style while sending
  sendButtonDisabled: {
    opacity: 0.55,
  },
  // EDIT END: slice 2 disabled send button style while sending
  // EDIT START: slice 3 pagination loading indicator spacing
  paginationFooter: {
    paddingVertical: 10,
  },
  // EDIT END: slice 3 pagination loading indicator spacing
  // EDIT START: slice 4 dev-only top dropdown styles
  listViewport: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  topChromeContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  havenNavbarShell: {
    borderBottomWidth: 1,
    borderBottomColor: "#2b3648",
    backgroundColor: "#101722",
  },
  havenNavbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  havenNavbarActionsLeft: {
    zIndex: 10,
    flexDirection: "row",
    gap: 8,
  },
  havenNavbarActionsRight: {
    zIndex: 10,
    flexDirection: "row",
    gap: 8,
  },
  havenIconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#182334",
  },
  havenNavbarTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#e6edf7",
  },
  channelBarShell: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#2b3648",
    backgroundColor: "#101722",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  channelBarCommunityPressable: {
    maxWidth: "38%",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  channelBarCommunityText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e6edf7",
  },
  channelBarSelectedChannelPressable: {
    marginHorizontal: 8,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  channelBarHash: {
    marginRight: 4,
    fontSize: 14,
    color: "#a9b8cf",
  },
  channelBarSelectedChannelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e6edf7",
  },
  channelBarCreateButton: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#182334",
  },
  channelModalOverlay: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 96,
    paddingHorizontal: 12,
  },
  channelModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.58)",
  },
  channelModalCard: {
    borderRadius: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    overflow: "hidden",
  },
  channelModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#374151",
  },
  channelModalTitle: {
    color: "#F3F4F6",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  channelModalCloseText: {
    color: "#a9b8cf",
    fontSize: 13,
    fontWeight: "600",
  },
  channelModalOptions: {
    maxHeight: 260,
  },
  channelModalOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  channelModalOptionText: {
    color: "#D1D5DB",
  },
  channelModalOptionTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  channelModalActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#374151",
    padding: 10,
  },
  channelModalCreateButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#182334",
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  channelModalCreateButtonText: {
    color: "#e6edf7",
    fontSize: 13,
    fontWeight: "600",
  },
  // EDIT END: slice 4 dev-only top dropdown styles
  // EDIT START: slice 5 reliability state styles
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  stateText: {
    color: "#E5E7EB",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 10,
    borderRadius: 8,
    backgroundColor: "#1F2937",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: "#F9FAFB",
    fontWeight: "600",
  },
  reportOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  reportOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.7)",
  },
  reportCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#101722",
    padding: 14,
    gap: 8,
  },
  reportTitle: {
    color: "#e6edf7",
    fontSize: 18,
    fontWeight: "700",
  },
  reportSubtitle: {
    color: "#9ba9bf",
    fontSize: 13,
    lineHeight: 18,
  },
  reportFieldLabel: {
    marginTop: 4,
    color: "#9ba9bf",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  reportChoiceGroup: {
    gap: 6,
  },
  reportChoice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reportChoiceActive: {
    borderColor: "#3F79D8",
    backgroundColor: "#1a2235",
  },
  reportChoiceText: {
    color: "#e6edf7",
    fontSize: 14,
  },
  reportCommentInput: {
    minHeight: 86,
    maxHeight: 170,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b3648",
    backgroundColor: "#111827",
    color: "#e6edf7",
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
    fontSize: 14,
  },
  reportErrorText: {
    color: "#fca5a5",
    fontSize: 12,
  },
  reportActionsRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  reportCancelButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2b3648",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reportCancelButtonText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
  },
  reportSubmitButton: {
    borderRadius: 8,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reportSubmitButtonDisabled: {
    opacity: 0.55,
  },
  reportSubmitButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  jumpToNewestWrapper: {
    alignItems: "center",
    marginBottom: 8,
  },
  jumpToNewestButton: {
    borderRadius: 999,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  jumpToNewestText: {
    color: "#e6edf7",
    fontSize: 12,
    fontWeight: "700",
  },
  // EDIT END: slice 5 reliability state styles
});
// EDIT END: local styles for fully in-line chat screen