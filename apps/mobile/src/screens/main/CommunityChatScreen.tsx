import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { type EnrichedMarkdownTextInputInstance } from "react-native-enriched-markdown";
import { useAuthStore } from "@mobile-data/session/authStore";
import { useUserStatusStore } from "@mobile-data/session/userStatusStore";
import {
  deriveCommunitiesLoadStatus,
  toChannel,
  toServerSummaries,
} from "@shared/core";
import { useHavenCore } from "@mobile-data";
import {
  useActiveChannelId,
  useActiveCommunityId,
  useChannels,
  useChannelsLoading,
  useCommunities,
  useCommunitiesLoadError,
  useCommunitiesLoading,
  useChannelMeta,
  useHasInitialLoadCompleted,
  useIsLoadingOlder,
  usePlatformStaff,
  useProfilesRecord,
  useVisibleChannel,
} from "@mobile-data/hooks";
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
import {
  MessageActionsSheet,
  type MessageActionTarget,
} from "@/features/community/MessageActionsSheet";
import { CommunityReportMessageModal } from "@/features/community/CommunityReportMessageModal";
import type { UserProfileModalTarget } from "@/features/user-profile/UserProfileModal";
import { CommunityPhaseGate } from "@/features/community/CommunityPhaseGate";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import { useDataCacheComponentProbe } from "@/debug/useDataCacheComponentProbe";
import type { CommunityMessageCache } from "@mobile-data/messages/CommunityMessageCache";

type CommunityChatScreenProps = {
  serverId: string;
  drawerGestureNonce?: number;
  onOpenProfileCard?: (target: UserProfileModalTarget) => void;
};

export function CommunityChatScreen({
  serverId,
  drawerGestureNonce = 0,
  onOpenProfileCard,
}: CommunityChatScreenProps) {
  const composerColors = useChatComposerColors();
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(
    null,
  );

  const core = useHavenCore();
  const { setRainbowMode } = useUserStatusStore();
  const user = useAuthStore((state) => state.user);
  const communityId = useActiveCommunityId(core.communities) ?? serverId;
  const navigationChannelId = useActiveChannelId(core.channels);
  const messageNexus = core.messages.for(
    communityId ?? "__none__",
  ) as CommunityMessageCache;
  const currentUserId = user?.id ?? null;
  const currentUserPlatformStaff = usePlatformStaff(
    core.profiles,
    currentUserId,
  );
  const nexusCommunities = useCommunities(core.communities);
  const serversLoading = useCommunitiesLoading(core.communities);
  const serversError = useCommunitiesLoadError(core.communities);
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
  const havenChannels = useChannels(core.channels, communityId ?? serverId);
  const channelsLoading = useChannelsLoading(
    core.channels,
    communityId ?? serverId,
  );
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

  const channelMeta = useChannelMeta(
    messageNexus,
    activeChannelId ?? "__none__",
  );
  const hasOlderMessages = channelMeta.hasMore;
  const isLoadingOlderMessages = useIsLoadingOlder(
    messageNexus,
    activeChannelId ?? "__none__",
  );
  const hasCompletedInitialLoad = useHasInitialLoadCompleted(
    messageNexus,
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
        optimisticMediaUri?: string | null;
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
        optimisticMediaUri: options?.optimisticMediaUri ?? null,
        senderUserId: currentUserId,
        senderIsPlatformStaff: currentUserPlatformStaff?.isActive === true,
      });
    },
    [
      activeChannelId,
      currentUserId,
      currentUserPlatformStaff?.isActive,
      messageNexus,
      setRainbowMode,
    ],
  );

  const visibleMessages = useVisibleChannel(
    messageNexus,
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
  const liveProfiles = useProfilesRecord(core.profiles);

  useEffect(() => {
    if (drawerGestureNonce <= 0) return;
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, [drawerGestureNonce]);

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
    () =>
      toInvertedChatOrder(
        mapBundlesToChatMessages(visibleMessages, liveProfiles),
      ),
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
  const [messageActionsTarget, setMessageActionsTarget] =
    useState<MessageActionTarget | null>(null);
  const [reportMessageTarget, setReportMessageTarget] =
    useState<MessageActionTarget | null>(null);

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
              optimisticMediaUri: media.localUri,
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

  const renderChatItem = useCallback(
    ({ item }: { item: ChatListItem }) => {
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
          onLongPress={() => {
            composerInputRef.current?.blur();
            setMessageActionsTarget({
              messageId: item.message.id,
              authorUserId: item.message.authorUserId ?? null,
              authorName: item.message.authorName ?? "User",
            });
          }}
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
    },
    [community?.name, communityId, onOpenProfileCard],
  );

  const canReportMessageTarget = Boolean(
    messageActionsTarget?.authorUserId &&
    messageActionsTarget.authorUserId !== currentUserId,
  );

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
      <MessageActionsSheet
        visible={messageActionsTarget !== null}
        onClose={() => setMessageActionsTarget(null)}
        target={messageActionsTarget}
        communityName={community?.name ?? "Community"}
        canReport={canReportMessageTarget}
        canKick={false}
        canBan={false}
        onReply={() => {
          if (messageActionsTarget)
            setPendingReplyToMessageId(messageActionsTarget.messageId);
        }}
        onReport={() => {
          if (messageActionsTarget && canReportMessageTarget) {
            setReportMessageTarget(messageActionsTarget);
          }
        }}
        onKick={() => {}}
        onBan={() => {}}
      />
      <CommunityReportMessageModal
        visible={reportMessageTarget !== null}
        onDismiss={() => setReportMessageTarget(null)}
        communityName={community?.name ?? "Community"}
        onSubmit={async (input) => {
          if (!activeChannelId || !currentUserId || !reportMessageTarget)
            return;
          await messageNexus.report({
            channelId: activeChannelId,
            messageId: reportMessageTarget.messageId,
            reporterUserId: currentUserId,
            ...input,
          });
        }}
      />
    </View>
  );
}
