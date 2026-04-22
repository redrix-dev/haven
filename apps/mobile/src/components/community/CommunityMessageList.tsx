import type {
  AuthorProfile,
  Channel,
  Message,
  MessageAttachment,
  MessageLinkPreview,
} from "@shared/lib/backend/types";
import { Video, ResizeMode } from "expo-av";
import {
  isAuthorProfileTombstone,
  getFallbackEmbedUrl,
  getReplyToMessageId,
} from "@shared/features/messaging/components/message-list/messageListContentUtils";
import { resolveLiveAvatarUrl } from "@shared/lib/liveProfiles";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import {
  Alert,
  ActionSheetIOS,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  commitChannelScrollExit,
  peekChannelScrollExit,
} from "../../storage/communityTimelinePrefs";

type CommunityMessageListProps = {
  communityId: string;
  channel: Channel | null;
  emptyCopy: string;
  messages: Message[];
  profiles: Record<string, AuthorProfile>;
  attachmentsByMessageId: Record<string, MessageAttachment[]>;
  linkPreviewsByMessageId: Record<string, MessageLinkPreview | null>;
  hasMore: boolean;
  isLoading: boolean;
  onLoadOlder: () => Promise<void>;
  onReply: (messageId: string) => void;
  onReport: (messageId: string) => void;
};

function formatTime(timestamp: string): string {
  const value = new Date(timestamp);
  return value.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const MESSAGE_JUMP_THRESHOLD = 220;
const ESTIMATED_ROW_HEIGHT = 76;

export function CommunityMessageList({
  communityId,
  channel,
  emptyCopy,
  messages,
  profiles,
  attachmentsByMessageId,
  linkPreviewsByMessageId,
  hasMore,
  isLoading,
  onLoadOlder,
  onReply,
  onReport,
}: CommunityMessageListProps) {
  const listRef = useRef<FlatList<Message> | null>(null);
  const messagesRef = useRef<Message[]>(messages);
  const [showJumpToNewest, setShowJumpToNewest] = useState(false);
  const nearBottomRef = useRef(true);
  const mountedNearBottomRef = useRef(true);
  const topVisibleMessageIdRef = useRef<string | null>(null);
  const scrollOffsetYRef = useRef(0);
  const pendingScrollToIndexRef = useRef<number | null>(null);
  const lastSeenLastMessageIdRef = useRef<string | undefined>(undefined);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);

  messagesRef.current = messages;

  const textChannelId =
    channel && channel.kind === "text" ? channel.id : null;

  const orderedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const exitPeek = useMemo(() => {
    if (!textChannelId) return null;
    return peekChannelScrollExit(communityId, textChannelId);
  }, [communityId, textChannelId]);

  const jumpHintFromExit = useMemo(() => {
    if (!textChannelId || orderedMessages.length === 0) {
      return false;
    }
    if (
      !exitPeek ||
      exitPeek.wasNearBottom !== false ||
      !exitPeek.anchorMessageId ||
      exitPeek.anchorMessageId.trim().length === 0
    ) {
      return false;
    }
    const anchorIdx = orderedMessages.findIndex((m) => m.id === exitPeek.anchorMessageId);
    return anchorIdx >= 0;
  }, [textChannelId, orderedMessages, exitPeek]);
  const initialContentOffset = useMemo(() => {
    if (!textChannelId) return undefined;
    const peek = peekChannelScrollExit(communityId, textChannelId);
    if (
      !peek ||
      peek.wasNearBottom !== false ||
      !peek.anchorMessageId?.trim() ||
      typeof peek.anchorOffsetY !== "number" ||
      !Number.isFinite(peek.anchorOffsetY) ||
      peek.anchorOffsetY <= 0
    ) {
      return undefined;
    }
    return { x: 0, y: peek.anchorOffsetY };
  }, [communityId, textChannelId]);

  /**
   * Persist scroll mode only when leaving the channel (cleanup), not on every scroll event.
   * Deps must stay on channel identity only — if message-derived hints were included, cleanup
   * would run mid-session when the first batch arrives and would corrupt the session map.
   */
  useLayoutEffect(() => {
    nearBottomRef.current = true;
    mountedNearBottomRef.current = true;
    topVisibleMessageIdRef.current = null;
    scrollOffsetYRef.current = 0;
    lastSeenLastMessageIdRef.current = undefined;

    return () => {
      if (!textChannelId || !communityId) return;

      const wasNearBottomOnExit = mountedNearBottomRef.current;
      const awayFromBottom = !wasNearBottomOnExit;
      if (!awayFromBottom) {
        commitChannelScrollExit(communityId, textChannelId, {
          wasNearBottom: true,
          anchorMessageId: null,
          anchorOffsetY: 0,
        });
        return;
      }

      const msgs = messagesRef.current;
      const len = msgs.length;
      const guessIdx =
        len > 0
          ? Math.min(
              len - 1,
              Math.max(0, Math.floor(scrollOffsetYRef.current / ESTIMATED_ROW_HEIGHT)),
            )
          : 0;
      const anchorMsg =
        topVisibleMessageIdRef.current ?? (len > 0 ? msgs[guessIdx]?.id : null) ?? null;

      if (!anchorMsg) {
        commitChannelScrollExit(communityId, textChannelId, {
          wasNearBottom: true,
          anchorMessageId: null,
        });
        return;
      }

      commitChannelScrollExit(communityId, textChannelId, {
        wasNearBottom: false,
        anchorMessageId: anchorMsg,
        anchorOffsetY: scrollOffsetYRef.current,
      });
    };
  }, [textChannelId, communityId]);

  useLayoutEffect(() => {
    setShowJumpToNewest(jumpHintFromExit);
  }, [jumpHintFromExit, textChannelId]);

  useLayoutEffect(() => {
    if (!textChannelId || messages.length === 0) return;
    const lastId = messages[messages.length - 1]?.id;
    const prev = lastSeenLastMessageIdRef.current;
    lastSeenLastMessageIdRef.current = lastId;
    if (
      prev !== undefined &&
      lastId !== undefined &&
      lastId !== prev &&
      nearBottomRef.current &&
      listRef.current
    ) {
      listRef.current.scrollToIndex({ index: 0, animated: true });
    }
  }, [messages, textChannelId]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    scrollOffsetYRef.current = contentOffset.y;
    const nearBottom = contentOffset.y <= MESSAGE_JUMP_THRESHOLD;
    nearBottomRef.current = nearBottom;
    mountedNearBottomRef.current = nearBottom;
    setShowJumpToNewest(!nearBottom);
  };

  const onViewableItemsChanged = useCallback(
    (info: { viewableItems: Array<ViewToken<Message>> }) => {
      const first = info.viewableItems.find((v) => v.isViewable && v.item);
      if (first?.item) {
        topVisibleMessageIdRef.current = first.item.id;
      }
    },
    [],
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 10,
      minimumViewTime: 80,
    }),
    [],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      const target = pendingScrollToIndexRef.current ?? info.index;
      pendingScrollToIndexRef.current = target;
      listRef.current?.scrollToOffset({
        offset: Math.max(0, target * ESTIMATED_ROW_HEIGHT),
        animated: false,
      });
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: target,
          animated: false,
          viewPosition: 0.15,
        });
      }, 100);
    },
    [],
  );

  const handleLongPressMessage = (messageId: string) => {
    if (Platform.OS !== "ios") {
      Alert.alert("Message actions", "Choose an action for this message.", [
        { text: "Reply", onPress: () => onReply(messageId) },
        { text: "Report", onPress: () => onReport(messageId) },
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
        if (index === 0) onReply(messageId);
        if (index === 1) onReport(messageId);
      },
    );
  };

  const handleOpenUrl = (url: string) => {
    void Linking.openURL(url);
  };

  const renderAttachments = useCallback(
    (messageId: string) => {
      const attachments = attachmentsByMessageId[messageId] ?? [];
      return attachments.map((attachment) => {
        if (!attachment.signedUrl) {
          return (
            <Text key={attachment.id} className="text-xs text-muted-foreground">
              Attachment unavailable.
            </Text>
          );
        }
        if (attachment.mediaKind === "image") {
          return (
            <Image
              key={attachment.id}
              source={{ uri: attachment.signedUrl }}
              style={{ width: "100%", height: 220, borderRadius: 12, marginTop: 8 }}
              resizeMode="cover"
            />
          );
        }
        if (attachment.mediaKind === "video") {
          return (
            <Video
              key={attachment.id}
              source={{ uri: attachment.signedUrl }}
              style={{ width: "100%", height: 220, borderRadius: 12, marginTop: 8 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
            />
          );
        }
        return (
          <Pressable
            key={attachment.id}
            onPress={() => handleOpenUrl(attachment.signedUrl ?? "")}
            className="mt-2 rounded-lg bg-surface-panel px-3 py-2"
          >
            <Text className="text-sm text-info">
              {attachment.originalFilename ?? "Open attachment"}
            </Text>
          </Pressable>
        );
      });
    },
    [attachmentsByMessageId, handleOpenUrl],
  );

  const renderLinkPreview = useCallback(
    (messageId: string) => {
      const preview = linkPreviewsByMessageId[messageId];
      if (!preview) return null;

      const embedUrl = getFallbackEmbedUrl(preview);
      const sourceUrl = preview.sourceUrl ?? preview.snapshot?.sourceUrl ?? "";
      const title = preview.snapshot?.title ?? sourceUrl;
      const siteName = preview.snapshot?.siteName ?? "Link preview";
      const thumbnailUrl = preview.snapshot?.thumbnail?.signedUrl ?? null;

      return (
        <Pressable
          onPress={() => sourceUrl && handleOpenUrl(sourceUrl)}
          className="mt-2 rounded-xl border border-border-panel bg-surface-panel p-3"
        >
          <Text className="text-xs text-muted-foreground">{siteName}</Text>
          <Text className="mt-1 text-sm font-semibold text-foreground">{title}</Text>
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={{ width: "100%", height: 150, borderRadius: 10, marginTop: 8 }}
              resizeMode="cover"
            />
          ) : null}
          {embedUrl ? (
            <Text className="mt-2 text-xs text-info">Video preview available - tap to open.</Text>
          ) : null}
        </Pressable>
      );
    },
    [linkPreviewsByMessageId, handleOpenUrl],
  );

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const cachedProfile =
        item.author_user_id != null
          ? (profiles[item.author_user_id] ?? null)
          : null;
      const preserveTombstone = isAuthorProfileTombstone(
        cachedProfile ?? undefined,
      );
      const liveAvatar =
        item.author_user_id != null && !preserveTombstone
          ? resolveLiveAvatarUrl(
              liveProfiles,
              item.author_user_id,
              cachedProfile?.avatarUrl ?? null,
            )
          : (cachedProfile?.avatarUrl ?? null);
      const authorName =
        cachedProfile?.username ??
        item.author_user_id?.slice(0, 12) ??
        "Unknown User";
      const replyToMessageId = getReplyToMessageId(item);
      const initial = authorName.trim().charAt(0).toUpperCase() || "U";

      return (
        <Pressable
          accessibilityRole="button"
          className="border-b border-border-panel/60 py-3"
          onLongPress={() => handleLongPressMessage(item.id)}
        >
          <View className="mb-1 flex-row items-center">
            <View className="mr-2 h-8 w-8 overflow-hidden rounded-full bg-surface-panel">
              {liveAvatar ? (
                <Image
                  source={{ uri: liveAvatar }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                  accessibilityLabel={`${authorName} avatar`}
                />
              ) : (
                <View className="h-full w-full items-center justify-center">
                  <Text className="text-xs font-semibold text-foreground">
                    {initial}
                  </Text>
                </View>
              )}
            </View>
            <Text className="mr-2 text-sm font-semibold text-foreground">{authorName}</Text>
            <Text className="text-xs text-muted-foreground">{formatTime(item.created_at)}</Text>
          </View>
          {replyToMessageId ? (
            <Text className="mb-1 text-xs text-muted-foreground">
              Replying to {replyToMessageId}
            </Text>
          ) : null}
          <Markdown
            style={{
              body: { color: "#e6edf7", fontSize: 14, lineHeight: 20 },
              strong: { fontWeight: "700" },
              em: { fontStyle: "italic" },
              code_inline: {
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 13,
                backgroundColor: "#1a2235",
                color: "#e6edf7",
                paddingHorizontal: 4,
                borderRadius: 3,
              },
              fence: {
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 13,
                backgroundColor: "#1a2235",
                color: "#e6edf7",
                padding: 10,
                borderRadius: 6,
                marginVertical: 4,
              },
              blockquote: {
                backgroundColor: "#1a2235",
                borderLeftColor: "#3F79D8",
                borderLeftWidth: 3,
                paddingHorizontal: 10,
                marginVertical: 2,
              },
              s: { textDecorationLine: "line-through" },
              bullet_list: { marginVertical: 2 },
              ordered_list: { marginVertical: 2 },
              link: { color: "#3F79D8" },
            }}
          >
            {item.content}
          </Markdown>
          {renderAttachments(item.id)}
          {renderLinkPreview(item.id)}
        </Pressable>
      );
    },
    [
      profiles,
      liveProfiles,
      attachmentsByMessageId,
      linkPreviewsByMessageId,
      handleLongPressMessage,
      renderAttachments,
      renderLinkPreview,
    ],
  );

  if (!channel || channel.kind !== "text") {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-center text-sm text-muted-foreground">{emptyCopy}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 pt-2">
      {hasMore ? (
        <Pressable
          onPress={() => void onLoadOlder()}
          className="mx-auto mb-2 mt-1 rounded-lg bg-surface-panel px-3 py-2"
        >
          <Text className="text-xs text-foreground">
            {isLoading ? "Loading older messages..." : "Load older messages"}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        className="flex-1"
        inverted
        key={textChannelId ?? "no-channel"}
        ref={listRef}
        data={orderedMessages}
        extraData={[profiles, liveProfiles, attachmentsByMessageId, linkPreviewsByMessageId]}
        keyExtractor={(message) => message.id}
        keyboardShouldPersistTaps="handled"
        contentOffset={initialContentOffset}
        maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 10 }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScrollToIndexFailed={(info) => {
          pendingScrollToIndexRef.current = info.index;
          handleScrollToIndexFailed(info);
        }}
        renderItem={renderItem}
      />
      {showJumpToNewest ? (
        <Pressable
          onPress={() => {
            listRef.current?.scrollToIndex({ index: 0, animated: true });
            setShowJumpToNewest(false);
            if (textChannelId) {
              commitChannelScrollExit(communityId, textChannelId, {
                wasNearBottom: true,
                anchorMessageId: null,
              });
            }
          }}
          className="absolute bottom-4 right-4 rounded-full bg-primary px-4 py-2"
        >
          <Text className="text-xs font-semibold text-foreground">Jump to newest</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
