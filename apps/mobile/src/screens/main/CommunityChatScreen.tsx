import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { type EnrichedMarkdownTextInputInstance } from "react-native-enriched-markdown";
import { useAuthStore } from "@shared/stores/authStore";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import {
  deriveCommunitiesLoadStatus,
  toChannel,
  toServerSummaries,
  useHavenCore,
} from "@shared/core";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import {
  buildChatListItemsFromChatMessages,
  buildMessageBundleById,
  getReplyTargetLabel,
  mapBundlesToChatMessages,
} from "@/features/community/communityChannelChatFromBundles";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
import { ChatReplyStrip } from "@/components/chat/ChatReplyStrip";
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { toInvertedChatOrder } from "@/components/chat/toInvertedChatOrder";
import {
  CommunityMessageBubble,
  MessageDateDivider,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";
import type { UserProfileModalTarget } from "@/features/user-profile/UserProfileModal";
import { CommunityPhaseGate } from "@/features/community/CommunityPhaseGate";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import { useDataCacheComponentProbe } from "@shared/debug";

type CommunityChatScreenProps = {
  serverId: string;
  onOpenProfileCard?: (target: UserProfileModalTarget) => void;
};

export function CommunityChatScreen({
  serverId,
  onOpenProfileCard,
}: CommunityChatScreenProps) {
  const composerColors = useChatComposerColors();
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(
    null,
  );

  const core = useHavenCore();
  const { setRainbowMode } = useUserStatusStore();
  const user = useAuthStore((state) => state.user);
  const communityId = core.communities.useActiveId() ?? serverId;
  const navigationChannelId = core.channels.useActiveChannelId();
  const messageNexus = core.messages.for(communityId ?? "__none__");
  const currentUserId = user?.id ?? null;
  const nexusCommunities = core.communities.useCommunities();
  const serversLoading = core.communities.useIsLoading();
  const serversError = core.communities.useLoadError();
  const servers = useMemo(
    () => toServerSummaries(nexusCommunities),
    [nexusCommunities],
  );
  const serversStatus = deriveCommunitiesLoadStatus({
    hasUser: Boolean(currentUserId),
    isLoading: serversLoading,
    loadError: serversError,
    communityCount: nexusCommunities.length,
  });
  const refreshServers = useCallback(async () => {
    if (!currentUserId) return;
    await core.refreshCommunities(currentUserId);
  }, [core, currentUserId]);
  const havenChannels = core.channels.useChannels(communityId ?? serverId);
  const channelsLoading = core.channels.useIsLoading(communityId ?? serverId);
  const channels = useMemo(() => havenChannels.map(toChannel), [havenChannels]);
  const currentChannel = useMemo(
    () =>
      navigationChannelId
        ? (channels.find((channel) => channel.id === navigationChannelId) ??
          null)
        : null,
    [channels, navigationChannelId],
  );
  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel &&
    communityId &&
    currentChannel.community_id === communityId,
  );
  const currentRenderableChannel = useMemo(
    () =>
      currentChannel &&
      currentChannelBelongsToCurrentServer &&
      currentChannel.kind === "text"
        ? currentChannel
        : (channels.find(
            (channel) =>
              channel.kind === "text" &&
              (!communityId || channel.community_id === communityId),
          ) ?? (currentChannelBelongsToCurrentServer ? currentChannel : null)),
    [
      channels,
      communityId,
      currentChannel,
      currentChannelBelongsToCurrentServer,
    ],
  );

  const activeChannelId = useMemo(() => {
    if (currentRenderableChannel?.id) return currentRenderableChannel.id;
    if (!navigationChannelId || communityId !== serverId) return null;
    if (channels.length > 0) {
      const match = channels.find(
        (channel) =>
          channel.id === navigationChannelId &&
          channel.community_id === communityId &&
          channel.kind === "text",
      );
      return match?.id ?? null;
    }
    return navigationChannelId;
  }, [
    channels,
    communityId,
    currentRenderableChannel?.id,
    navigationChannelId,
    serverId,
  ]);

  const activeChannelIdForLoad = activeChannelId;

  useEffect(() => {
    if (!communityId || !activeChannelIdForLoad) return;
    void core.prepareTextChannelMessages(communityId, activeChannelIdForLoad);
  }, [core, communityId, activeChannelIdForLoad]);

  const channelMeta = messageNexus.useChannelMeta(
    activeChannelId ?? "__none__",
  );
  const hasOlderMessages = channelMeta.hasMore;
  const isLoadingOlderMessages = messageNexus.useIsLoadingOlder(
    activeChannelId ?? "__none__",
  );
  const hasCompletedInitialLoad = messageNexus.useHasInitialLoadCompleted(
    activeChannelId ?? "__none__",
  );

  const requestOlderMessages = useCallback(async () => {
    if (!activeChannelId || !hasOlderMessages || isLoadingOlderMessages) return;
    try {
      await messageNexus.loadOlder(activeChannelId);
    } catch (err) {
      console.error("Error loading older messages:", err);
    }
  }, [activeChannelId, hasOlderMessages, isLoadingOlderMessages, messageNexus]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        replyToMessageId?: string;
        mediaArrayBuffer?: ArrayBuffer;
        mediaContentType?: string;
        mediaFilename?: string;
      },
    ) => {
      if (content === "#RainbowRoad") {
        setRainbowMode(!useUserStatusStore.getState().rainbowMode);
        return;
      }
      if (!currentUserId || !activeChannelId) return;
      await messageNexus.sendWithMedia(activeChannelId, content, {
        replyToMessageId: options?.replyToMessageId ?? null,
        mediaArrayBuffer: options?.mediaArrayBuffer,
        mediaContentType: options?.mediaContentType,
        mediaFilename: options?.mediaFilename,
        senderUserId: currentUserId,
      });
    },
    [activeChannelId, currentUserId, messageNexus, setRainbowMode],
  );

  const visibleMessages = messageNexus.useVisibleChannel(
    activeChannelId ?? "__none__",
  );

  useDataCacheComponentProbe("CommunityChatScreen", {
    serverId,
    communityId,
    navigationChannelId,
    activeChannelId,
    channelsCount: channels.length,
    currentRenderableChannelId: currentRenderableChannel?.id ?? null,
    visibleMessagesCount: visibleMessages.length,
    hasOlderMessages,
    isLoadingOlderMessages,
    hasCompletedInitialLoad,
    nexusMessagesCount: visibleMessages.length,
    nexusIsInitialized: visibleMessages.length > 0 || hasCompletedInitialLoad,
    channelsLoading,
    communityIdMatchesRoute: communityId === serverId,
  });
  const liveProfiles = core.profiles.useProfilesRecord();

  const community = useMemo(
    () =>
      communityId ? (servers.find((s) => s.id === communityId) ?? null) : null,
    [communityId, servers],
  );

  const messageById = useMemo(
    () => buildMessageBundleById(visibleMessages),
    [visibleMessages],
  );

  const messages = useMemo<ChatMessage[]>(
    // toInvertedChatOrder reverses ascending nexus order to descending for
    // ChatInterface's inverted FlatList (newest at data[0] = visual bottom).
    () => toInvertedChatOrder(mapBundlesToChatMessages(visibleMessages, liveProfiles)),
    [liveProfiles, visibleMessages],
  );

  const chatListItems = useMemo<ChatListItem[]>(
    () => buildChatListItemsFromChatMessages(messages),
    [messages],
  );

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPickingCommunityMedia, setIsPickingCommunityMedia] = useState(false);
  const [pendingCommunityMedia, setPendingCommunityMedia] =
    useState<CommunityMediaUploadPayload | null>(null);
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<
    string | null
  >(null);

  const pendingReplyTargetLabel = useMemo(
    () =>
      pendingReplyToMessageId
        ? getReplyTargetLabel(
            pendingReplyToMessageId,
            messageById,
            liveProfiles,
          )
        : null,
    [messageById, pendingReplyToMessageId, liveProfiles],
  );

  const handlePickCommunityMedia = useCallback(async () => {
    if (isSending || isPickingCommunityMedia) return;
    setIsPickingCommunityMedia(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow Photos access to attach images or videos.",
        );
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
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode
                  .Compatible,
            }
          : {}),
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      const payload = await loadPickedCommunityMediaForUpload(asset);
      setPendingCommunityMedia(payload);
    } catch (e) {
      Alert.alert(
        "Could not add media",
        getErrorMessage(e, "Choose a different file."),
      );
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
      await sendMessage(text, {
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
  }, [
    draft,
    messageById,
    pendingCommunityMedia,
    pendingReplyToMessageId,
    sendMessage,
  ]);

  const renderChatItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.kind === "divider") {
      return <MessageDateDivider label={item.label} />;
    }

    const canOpenAuthorProfile =
      Boolean(item.message.authorUserId) &&
      item.message.authorName !== "Banned User" &&
      item.message.authorName !== "Unknown User";

    return (
      <CommunityMessageBubble
        {...item.message}
        attachments={item.message.attachments ?? []}
        isCondensed={item.isCondensed}
        onPress={() => composerInputRef.current?.blur()}
        onPressAuthor={
          canOpenAuthorProfile && item.message.authorUserId
            ? () => {
                composerInputRef.current?.blur();
                onOpenProfileCard?.({
                  userId: item.message.authorUserId!,
                  username: item.message.authorName ?? "User",
                  avatarUrl: item.message.authorAvatarUrl ?? null,
                  sourceCommunityId: communityId,
                  sourceCommunityName: community?.name ?? null,
                });
              }
            : undefined
        }
      />
    );
  }, [onOpenProfileCard]);

  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";

  if (phase !== "ready") {
    return (
      <CommunityPhaseGate
        phase={phase}
        error={serversError}
        onRetry={refreshServers}
      />
    );
  }

  const canSendCommunityMessage =
    draft.trim().length > 0 || pendingCommunityMedia != null;

  const isMessagesBootstrapping =
    Boolean(activeChannelId) &&
    visibleMessages.length === 0 &&
    !hasCompletedInitialLoad;

  const listEmptyContent =
    !activeChannelId && channelsLoading ? (
      <View className="min-h-30 items-center justify-center pt-8">
        <ActivityIndicator color={composerColors.spinner} />
      </View>
    ) : isMessagesBootstrapping ? (
      <View className="min-h-30 items-center justify-center pt-8">
        <ActivityIndicator color={composerColors.spinner} />
      </View>
    ) : (
      <View className="min-h-30 items-center justify-center pt-8">
        <Text className="text-muted-foreground text-[13px]">
          No messages yet.
        </Text>
      </View>
    );

  const conversationKey = `${serverId}:${activeChannelId ?? "none"}`;

  return (
    <View className="flex-1 bg-background" style={{ flex: 1 }}>
      <Animated.View
        key={conversationKey}
        entering={FadeIn.duration(150)}
        className="flex-1"
        style={{ flex: 1 }}
      >
        <ChatInterface
          data={chatListItems}
          keyExtractor={(item) =>
            item.kind === "message" ? item.message.id : item.id
          }
          renderItem={renderChatItem}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (hasOlderMessages && !isLoadingOlderMessages) {
              void requestOlderMessages();
            }
          }}
          ListEmptyComponent={listEmptyContent}
          ListFooterComponent={
            isLoadingOlderMessages ? (
              <View className="py-2.5">
                <ActivityIndicator color={composerColors.spinner} />
              </View>
            ) : null
          }
          composer={
            <ChatComposer
              inputRef={composerInputRef}
              colors={composerColors}
              isSending={isSending}
              isPickingMedia={isPickingCommunityMedia}
              canSend={canSendCommunityMessage}
              onChangeMarkdown={setDraft}
              onSend={() => void handleSend()}
              onPickMedia={() => void handlePickCommunityMedia()}
              strips={
                <>
                  {pendingReplyToMessageId ? (
                    <ChatReplyStrip
                      label={`Replying to ${pendingReplyTargetLabel ?? "a message"}`}
                      onCancel={() => setPendingReplyToMessageId(null)}
                    />
                  ) : null}
                  {pendingCommunityMedia ? (
                    <ChatMediaAttachmentStrip
                      fileName={pendingCommunityMedia.fileName}
                      disabled={isSending}
                      onRemove={() => setPendingCommunityMedia(null)}
                    />
                  ) : null}
                </>
              }
            />
          }
        />
      </Animated.View>
    </View>
  );
}
