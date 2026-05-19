import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import {
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { useAuthStore } from "@shared/stores/authStore";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessageNexus } from "@shared/features/messaging/hooks/useMessageNexus";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
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
import {
  CommunityMessageBubble,
  MessageDateDivider,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";
import { CommunityPhaseGate } from "@/features/community/CommunityPhaseGate";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import {
  useMobileCommunityWorkspace,
  useMobileServersFromSession,
} from "@/contexts/MobileMainSessionContext";
import { useDataCacheComponentProbe } from "@shared/debug";

type CommunityChatScreenProps = {
  serverId: string;
};

export function CommunityChatScreen({ serverId }: CommunityChatScreenProps) {
  const composerColors = useChatComposerColors();
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);

  const communityId = useNavigationStore((state) => state.currentServerId) ?? serverId;
  const navigationChannelId = useNavigationStore((state) => state.currentChannelId);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  const { servers, status: serversStatus, error: serversError, refreshServers } =
    useMobileServersFromSession();
  const {
    state: { channels, channelsLoading },
    derived: { currentRenderableChannel },
  } = useMobileCommunityWorkspace();

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

  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: activeChannelId,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });

  const nexusMessaging = useMessageNexus(communityId ?? null, activeChannelId ?? null);

  const storedMessages = useMessagesStore((state) => state.messages);

  useDataCacheComponentProbe("CommunityChatScreen", {
    serverId,
    communityId,
    navigationChannelId,
    activeChannelId,
    channelsCount: channels.length,
    currentRenderableChannelId: currentRenderableChannel?.id ?? null,
    storedMessagesCount: storedMessages.length,
    hasOlderMessages: messaging.state.hasOlderMessages,
    isLoadingOlderMessages: messaging.state.isLoadingOlderMessages,
    hasCompletedInitialLoad: messaging.state.hasCompletedInitialLoad,
    nexusMessagesCount: nexusMessaging.messages.length,
    nexusIsInitialized: nexusMessaging.isInitialized,
    channelsLoading,
    communityIdMatchesRoute: communityId === serverId,
  });
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);

  const community = useMemo(
    () => (communityId ? servers.find((s) => s.id === communityId) ?? null : null),
    [communityId, servers],
  );

  const messageById = useMemo(() => buildMessageBundleById(storedMessages), [storedMessages]);

  const messages = useMemo<ChatMessage[]>(
    () => mapBundlesToChatMessages(storedMessages, liveProfiles),
    [liveProfiles, storedMessages],
  );

  const chatListItems = useMemo<ChatListItem[]>(
    () => buildChatListItemsFromChatMessages(messages),
    [messages],
  );

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPickingCommunityMedia, setIsPickingCommunityMedia] = useState(false);
  const [pendingCommunityMedia, setPendingCommunityMedia] = useState<CommunityMediaUploadPayload | null>(
    null,
  );
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<string | null>(null);

  const pendingReplyTargetLabel = useMemo(
    () =>
      pendingReplyToMessageId
        ? getReplyTargetLabel(pendingReplyToMessageId, messageById, liveProfiles)
        : null,
    [messageById, pendingReplyToMessageId, liveProfiles],
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

  const renderChatItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.kind === "divider") {
      return <MessageDateDivider label={item.label} />;
    }

    return (
      <CommunityMessageBubble
        {...item.message}
        attachments={item.message.attachments ?? []}
        isCondensed={item.isCondensed}
        onPress={() => composerInputRef.current?.blur()}
      />
    );
  }, []);

  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";

  if (phase !== "ready") {
    return <CommunityPhaseGate phase={phase} error={serversError} onRetry={refreshServers} />;
  }

  const canSendCommunityMessage = draft.trim().length > 0 || pendingCommunityMedia != null;

  const isMessagesBootstrapping =
    Boolean(activeChannelId) &&
    storedMessages.length === 0 &&
    !messaging.state.hasCompletedInitialLoad;

  const listEmptyContent =
    !activeChannelId && channelsLoading ? (
      <View className="min-h-[120px] items-center justify-center pt-8">
        <ActivityIndicator color={composerColors.spinner} />
      </View>
    ) : isMessagesBootstrapping ? (
      <View className="min-h-[120px] items-center justify-center pt-8">
        <ActivityIndicator color={composerColors.spinner} />
      </View>
    ) : (
      <View className="min-h-[120px] items-center justify-center pt-8">
        <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
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
        keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
        renderItem={renderChatItem}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (messaging.state.hasOlderMessages && !messaging.state.isLoadingOlderMessages) {
            void messaging.actions.requestOlderMessages();
          }
        }}
        ListEmptyComponent={listEmptyContent}
        ListFooterComponent={
          messaging.state.isLoadingOlderMessages ? (
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
                    iconColor={composerColors.iconMuted}
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
