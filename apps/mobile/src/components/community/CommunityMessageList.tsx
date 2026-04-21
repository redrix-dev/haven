import type {
  AuthorProfile,
  Channel,
  Message,
  MessageAttachment,
  MessageLinkPreview,
} from "@shared/lib/backend/types";
import { Video, ResizeMode } from "expo-av";
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
} from "react-native";
import Markdown from "react-native-markdown-display";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getFallbackEmbedUrl,
  getReplyToMessageId,
} from "@shared/features/messaging/components/message-list/messageListContentUtils";
import {
  getCommunityTimelineAnchor,
  setCommunityTimelineAnchor,
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
  const [showJumpToNewest, setShowJumpToNewest] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  const handleSaveAnchor = async (
    anchorMessageId: string | null,
    wasNearBottom: boolean,
  ) => {
    if (!channel || channel.kind !== "text") return;
    await setCommunityTimelineAnchor(communityId, channel.id, {
      anchorMessageId,
      wasNearBottom,
      savedAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    setIsRestored(false);
  }, [channel?.id]);

  useEffect(() => {
    const restore = async () => {
      if (!channel || channel.kind !== "text" || isRestored) return;
      const anchor = await getCommunityTimelineAnchor(communityId, channel.id);
      if (!anchor?.anchorMessageId || messages.length === 0) {
        setIsRestored(true);
        return;
      }
      const index = messages.findIndex(
        (message) => message.id === anchor.anchorMessageId,
      );
      if (index >= 0) {
        setTimeout(() => {
          listRef.current?.scrollToIndex({ index, animated: false });
        }, 40);
      }
      setIsRestored(true);
    };
    void restore();
  }, [channel, communityId, isRestored, messages]);

  useEffect(() => {
    if (!showJumpToNewest && messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, showJumpToNewest]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom <= MESSAGE_JUMP_THRESHOLD;
    setShowJumpToNewest(!nearBottom);

    const estimatedAnchorIndex = Math.min(
      Math.max(Math.floor(contentOffset.y / 76), 0),
      Math.max(messages.length - 1, 0),
    );
    const anchorMessage = messages[estimatedAnchorIndex] ?? null;
    void handleSaveAnchor(anchorMessage?.id ?? null, nearBottom);
  };

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

  const orderedMessages = useMemo(() => [...messages], [messages]);

  if (!channel || channel.kind !== "text") {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-center text-sm text-muted-foreground">{emptyCopy}</Text>
      </View>
    );
  }

  const renderAttachments = (messageId: string) => {
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
  };

  const renderLinkPreview = (messageId: string) => {
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
  };

  return (
    <View className="flex-1 pt-2">
      <FlatList
        ref={listRef}
        data={orderedMessages}
        keyExtractor={(message) => message.id}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onEndReachedThreshold={0.2}
        onEndReached={() => {
          if (hasMore && !isLoading) {
            void onLoadOlder();
          }
        }}
        ListHeaderComponent={
          hasMore ? (
            <Pressable
              onPress={() => void onLoadOlder()}
              className="mx-auto mb-2 mt-1 rounded-lg bg-surface-panel px-3 py-2"
            >
              <Text className="text-xs text-foreground">
                {isLoading ? "Loading older messages..." : "Load older messages"}
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const profile = profiles[item.author_user_id ?? ""] ?? null;
          const authorName =
            profile?.username ?? item.author_user_id?.slice(0, 12) ?? "Unknown User";
          const replyToMessageId = getReplyToMessageId(item);
          return (
            <Pressable
              accessibilityRole="button"
              className="border-b border-border-panel/60 py-3"
              onLongPress={() => handleLongPressMessage(item.id)}
            >
              <View className="mb-1 flex-row items-center">
                <View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-surface-panel">
                  <Text className="text-xs font-semibold text-foreground">
                    {authorName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="mr-2 text-sm font-semibold text-foreground">{authorName}</Text>
                <Text className="text-xs text-muted-foreground">{formatTime(item.created_at)}</Text>
              </View>
              {replyToMessageId ? (
                <Text className="mb-1 text-xs text-muted-foreground">
                  Replying to {replyToMessageId}
                </Text>
              ) : null}
              <Markdown style={{ body: { color: "#e6edf7", fontSize: 14, lineHeight: 20 } }}>
                {item.content}
              </Markdown>
              {renderAttachments(item.id)}
              {renderLinkPreview(item.id)}
            </Pressable>
          );
        }}
      />
      {showJumpToNewest ? (
        <Pressable
          onPress={() => {
            listRef.current?.scrollToEnd({ animated: true });
            void handleSaveAnchor(messages[messages.length - 1]?.id ?? null, true);
          }}
          className="absolute bottom-4 right-4 rounded-full bg-primary px-4 py-2"
        >
          <Text className="text-xs font-semibold text-foreground">Jump to newest</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
