import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { KeyboardStickyView, useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import type {
  Channel,
  MessageAttachment,
  MessageLinkPreview,
} from "@shared/lib/backend/types";
import { useServers } from "@shared/features/community/hooks/useServers";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useAuthStore } from "@shared/stores/authStore";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useLiveProfiles } from "@shared/features/profile/hooks/useLiveProfiles";
import { getControlPlaneBackend } from "@shared/lib/backend";
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
  const communityId = useNavigationStore((state) => state.currentServerId) ?? "";
  if (!communityId) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-app">
        <Text className="text-sm text-muted-foreground">Select a community to get started.</Text>
      </View>
    );
  }
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

  const prefetchChannelMessagesRef = useRef(
    messaging.actions.prefetchChannelMessages,
  );
  prefetchChannelMessagesRef.current = messaging.actions.prefetchChannelMessages;

  const textChannelIdsKey = useMemo(
    () =>
      textChannels
        .map((channel) => channel.id)
        .sort()
        .join(","),
    [textChannels],
  );

  useEffect(() => {
    if (!textChannelIdsKey) return;
    const ids = textChannelIdsKey.split(",").filter(Boolean);
    const maxPrefetch = 10;
    void Promise.allSettled(
      ids.slice(0, maxPrefetch).map((channelId) =>
        prefetchChannelMessagesRef.current(communityId, channelId),
      ),
    );
  }, [communityId, textChannelIdsKey]);

  useLiveProfiles({
    controlPlaneBackend: getControlPlaneBackend(),
    userId: currentUserId,
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

  const showChatComposer =
    phase === "ready" &&
    !(channelsLoading && channels.length === 0) &&
    !(channelsError && channels.length === 0);

  const keyboardHeight = useSharedValue(0);

  useKeyboardHandler(
    {
      onMove: (e) => {
        "worklet";
        keyboardHeight.value = e.height;
      },
      onEnd: (e) => {
        "worklet";
        keyboardHeight.value = e.height;
      },
    },
    [],
  );

  const listAnimatedStyle = useAnimatedStyle(
    () => ({
      flex: 1,
      paddingBottom: keyboardHeight.value,
    }),
    [],
  );

  return (
    <View className="flex-1 bg-surface-app">
      <View>
        <HavenNavbar />
        <CommunityChannelBar
          communityName={title}
          selectedChannelName={selectedChannelTitle}
          onPressCommunity={handleOpenCommunitySettings}
          onPressSelectedChannel={handleOpenSwitcher}
          onPressCreateChannel={handleCreateChannel}
        />
      </View>

      <View className="px-4" style={{ flex: 1 }}>
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
              <Animated.View style={listAnimatedStyle}>
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
              </Animated.View>
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
      </View>

      {showChatComposer ? (
        <KeyboardStickyView
          offset={{ closed: 0, opened: -8 }}
          style={{ backgroundColor: "#0F1728" }}
        >
          <HavenComposer
            disabled={!canCompose}
            isSending={isSendingMessage}
            onSend={handleSendMessage}
          />
        </KeyboardStickyView>
      ) : null}

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