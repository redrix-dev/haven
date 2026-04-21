import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import type {
  Channel,
  MessageAttachment,
  MessageLinkPreview,
} from "@shared/lib/backend/types";
import type { RootStackParamList } from "../navigation/types";
import { useServers } from "@shared/features/community/hooks/useServers";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useAuthStore } from "@shared/stores/authStore";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { HavenNavbar } from "../components/HavenNavbar";
import { CommunityChannelBar } from "../components/community/CommunityChannelBar";
import { ChannelSwitcherModal } from "../components/community/ChannelSwitcherModal";
import { CommunityMessageList } from "../components/community/CommunityMessageList";
import { HavenComposer } from "../components/community/HavenComposer";
import {
  getLastTextChannelIdForCommunity,
  setLastTextChannelIdForCommunity,
} from "../storage/communityChannelPrefs";

/**
 * Mobile community workspace entry: keeps navigationStore in sync with the
 * shared “current server” id, loads membership via Supabase auth + control
 * plane backend (Haven runtime), and renders a minimal shell for UI iteration.
 */
export function CommunityScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "Community">>();
  const { communityId } = route.params;
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const { servers, status: serversStatus, error: serversError, refreshServers } =
    useServers();
  const {
    state: { channels, channelsLoading, channelsError },
    derived: { currentChannel, currentRenderableChannel },
  } = useCommunityWorkspace({
    servers,
    currentUserId,
  });

  useEffect(() => {
    useNavigationStore.getState().setCurrentServerId(communityId);
    return () => {
      useNavigationStore.getState().setCurrentServerId(null);
      useNavigationStore.getState().setCurrentChannelId(null);
    };
  }, [communityId]);

  const community = servers.find((entry) => entry.id === communityId) ?? null;
  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";
  const errorMessage = phase === "error" ? serversError : null;

  const textChannels = useMemo(
    () => channels.filter((channel) => channel.kind === "text"),
    [channels],
  );
  const messages = useMessagesStore((state) => state.messages);
  const profiles = useMessagesStore((state) => state.profiles);
  const attachmentRecord = useMessagesStore((state) => state.attachments);
  const linkPreviewRecord = useMessagesStore((state) => state.linkPreviews);

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

  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: currentRenderableChannel?.id ?? null,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });

  useEffect(() => {
    let cancelled = false;
    if (phase !== "ready" || channelsLoading) return;

    const resolveInitialTextChannel = async () => {
      const activeTextChannel =
        currentChannel && currentChannel.kind === "text" ? currentChannel : null;
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
  }, [
    channelsLoading,
    communityId,
    currentChannel,
    phase,
    setCurrentChannelId,
    textChannels,
  ]);

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      const selectedChannel = channels.find((channel) => channel.id === channelId) ?? null;
      setCurrentChannelId(channelId);
      if (selectedChannel?.kind === "text") {
        void setLastTextChannelIdForCommunity(communityId, selectedChannel.id);
      }
      setIsSwitcherOpen(false);
    },
    [channels, communityId, setCurrentChannelId],
  );

  const handleOpenCommunitySettings = useCallback(() => {
    navigation.navigate("SettingsPlaceholder" as never);
  }, [navigation]);

  const handleOpenSwitcher = useCallback(() => {
    setIsSwitcherOpen(true);
  }, []);

  const handleCloseSwitcher = useCallback(() => {
    setIsSwitcherOpen(false);
  }, []);

  const handleCreateChannel = useCallback(() => {
    return;
  }, []);

  const title = phase === "ready" && community ? community.name : "Community";
  const selectedChannelTitle = currentChannel?.name ?? "Select channel";
  const canCompose = Boolean(currentRenderableChannel && currentRenderableChannel.kind === "text");
  const hasActiveVoiceSession = false;
  const onReturnToVoiceChannel = () => undefined;
  const HEADER_STACK_OFFSET = 132;
  const handleReplyMessage = useCallback((messageId: string) => {
    Alert.alert("Reply", `Reply flow for ${messageId} will open next.`);
  }, []);
  const handleReportMessage = useCallback((messageId: string) => {
    Alert.alert("Report", `Report flow for ${messageId} will open next.`);
  }, []);

  const handleSendMessage = useCallback(
    async (payload: {
      content: string;
      mediaAsset?: { uri: string; fileName: string; mimeType: string };
    }) => {
      try {
        setIsSendingMessage(true);
        if (!payload.mediaAsset) {
          await messaging.actions.sendMessage(payload.content);
          return;
        }
        const response = await fetch(payload.mediaAsset.uri);
        const blob = await response.blob();
        const file = new File([blob], payload.mediaAsset.fileName, {
          type: payload.mediaAsset.mimeType,
        });
        await messaging.actions.sendMessage(payload.content, { mediaFile: file });
      } finally {
        setIsSendingMessage(false);
      }
    },
    [messaging.actions],
  );

  return (
    <View className="flex-1 bg-surface-app">
      <HavenNavbar />

      <CommunityChannelBar
        communityName={title}
        selectedChannelName={selectedChannelTitle}
        onPressCommunity={handleOpenCommunitySettings}
        onPressSelectedChannel={handleOpenSwitcher}
        onPressCreateChannel={handleCreateChannel}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={HEADER_STACK_OFFSET}
      >
      <View className="flex-1 px-4">
        {hasActiveVoiceSession ? (
          <Pressable onPress={onReturnToVoiceChannel}>
            <Text className="pb-2 text-center text-xs text-muted-foreground">
              Return to active voice channel
            </Text>
          </Pressable>
        ) : null}

        {phase === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#e6edf7" size="large" />
          </View>
        ) : null}
  
        {phase === "ready" ? (
          <View className="flex-1">
            {channelsLoading && channels.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#e6edf7" />
              </View>
            ) : channelsError && channels.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <Text className="text-sm text-destructive">{channelsError}</Text>
                <Pressable
                  onPress={() => void refreshServers()}
                  className="mt-2 rounded-lg bg-surface-panel px-3 py-2"
                >
                  <Text className="text-foreground">Retry</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <CommunityMessageList
                  communityId={communityId}
                  channel={currentRenderableChannel as Channel | null}
                  emptyCopy="Use the channel switcher to select a channel."
                  messages={messages}
                  profiles={profiles}
                  attachmentsByMessageId={attachmentsByMessageId}
                  linkPreviewsByMessageId={linkPreviewsByMessageId}
                  hasMore={messaging.state.hasOlderMessages}
                  isLoading={messaging.state.isLoadingOlderMessages}
                  onLoadOlder={messaging.actions.requestOlderMessages}
                  onReply={handleReplyMessage}
                  onReport={handleReportMessage}
                />
                <HavenComposer
                  disabled={!canCompose}
                  isSending={isSendingMessage}
                  onSend={handleSendMessage}
                />
              </>
            )}
          </View>
        ) : null}
  
        {phase === "missing" ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-sm text-muted-foreground">
              This community is not in your list or you no longer have access.
            </Text>
            <Pressable
              onPress={() => void refreshServers()}
              className="mt-3 rounded-lg bg-surface-panel px-4 py-2"
            >
              <Text className="text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}
  
        {phase === "error" && errorMessage ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-sm text-destructive">{errorMessage}</Text>
            <Pressable
              onPress={() => void refreshServers()}
              className="mt-3 rounded-lg bg-surface-panel px-4 py-2"
            >
              <Text className="text-foreground">Retry</Text>
            </Pressable>
          </View>
        ) : null}
  
        <Text className="pb-4 text-center text-xs text-muted-foreground opacity-80" selectable>
          id: {communityId}
        </Text>
      </View>
      </KeyboardAvoidingView>

      <ChannelSwitcherModal
        visible={isSwitcherOpen}
        communityName={title}
        channels={channels}
        selectedChannelId={currentChannel?.id ?? null}
        onSelectChannel={handleSelectChannel}
        onRequestClose={handleCloseSwitcher}
        onCreateChannel={handleCreateChannel}
      />
    </View>
  );
}