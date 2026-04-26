import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from "react-native";
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
import { useServers } from "@shared/features/community/hooks/useServers";
import type { Channel, Message } from "@shared/lib/backend/types";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getLastTextChannelIdForCommunity,
  setLastTextChannelIdForCommunity,
} from "../storage/communityChannelPrefs";

// EDIT START: add local message model/constants for standalone in-line screen
type ChatMessage = { id: string; text: string };
type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;
const INPUT_HEIGHT = 42;
const INITIAL_MESSAGES: ChatMessage[] = [];
const TOP_CHROME_ROW_HEIGHT = 44;
const TOP_CHROME_MARGIN = 8;
const DEV_LIST_VISUAL_TOP_BREATHING = 8;
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
function Message({ text }: ChatMessage) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.messageBubble}>
        <Text style={styles.messageText}>{text}</Text>
      </View>
    </View>
  );
}
// EDIT END: local in-line message bubble renderer

// EDIT START: export as CommunityScreen to wire directly in navigation
export function CommunityScreen() {
  // EDIT START: slice 1 real message source context from production hooks
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
  // EDIT END: slice 1 real message source context from production hooks

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
  // EDIT END: slice 4 channel context resolution and dev-only dropdown state

  const textInputRef = useRef<TextInput>(null);
  const textRef = useRef("");
  // EDIT START: slice 2 minimal send-loading state for real send pipeline
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  // EDIT END: slice 2 minimal send-loading state for real send pipeline
  // EDIT START: keep local send behavior while hydrating list from real store
  const [localMessages, setLocalMessages] = useState(INITIAL_MESSAGES);
  const messages = useMemo<ChatMessage[]>(() => {
    const localIds = new Set(localMessages.map((message) => message.id));
    const hydratedMessagesNewestFirst = [...storedMessages]
      .reverse()
      .map((message: Message) => ({
        id: message.id,
        text: message.content,
      }))
      .filter((message) => !localIds.has(message.id));
    return [...localMessages, ...hydratedMessagesNewestFirst];
  }, [localMessages, storedMessages]);
  // EDIT END: keep local send behavior while hydrating list from real store
  const { bottom, top } = useSafeAreaInsets();
  // EDIT START: align top chrome + list padding with safe-area notch
  const topChromeTopInset = top;
  const topChromeOccupiedHeight = topChromeHeight > 0 ? topChromeHeight : top + TOP_CHROME_ROW_HEIGHT;
  const devVisualTopPaddingBottom = __DEV__ ? DEV_LIST_VISUAL_TOP_BREATHING : 0;
  // EDIT END: align top chrome + list padding with safe-area notch
  const extraContentPadding = useSharedValue(0);

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} extraContentPadding={extraContentPadding} />
    ),
    [extraContentPadding],
  );

  // EDIT START: slice 2 swap local append send to real messaging send action
  const onSend = useCallback(async () => {
    const text = textRef.current.trim();
    if (!text) return;

    try {
      setIsSendingMessage(true);
      await messaging.actions.sendMessage(text);
      textInputRef.current?.clear();
      textRef.current = "";
    } finally {
      setIsSendingMessage(false);
    }
  }, [messaging.actions]);
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
            data={messages}
            inverted
            // EDIT START: add bottom spacing so top dev bar doesn't clip oldest message access
            contentContainerStyle={{
              paddingTop: 10,
              paddingBottom: devVisualTopPaddingBottom,
            }}
            // EDIT END: add bottom spacing so top dev bar doesn't clip oldest message access
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <Message {...item} />}
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
            <TextInput
              ref={textInputRef}
              multiline
              nativeID="chat-input"
              placeholder="Type a message..."
              style={styles.input}
              onChangeText={(text) => (textRef.current = text)}
              onLayout={onInputLayout}
            />
            <TouchableOpacity
              onPress={() => void onSend()}
              style={[styles.sendButton, isSendingMessage && styles.sendButtonDisabled]}
              disabled={isSendingMessage}
            >
              <Text style={styles.sendButtonText}>{isSendingMessage ? "..." : "Send"}</Text>
            </TouchableOpacity>
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
          <View style={styles.topChromePrimaryRow}>
            <Text style={styles.topChromeCommunityTitle}>{community?.name ?? "Community"}</Text>
            <Pressable style={styles.topChromePrimaryAction}>
              <Text style={styles.topChromePrimaryActionText}>Settings</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setIsChannelDropdownOpen((prev) => !prev)}
            style={styles.topChromeChannelTrigger}
          >
            <Text style={styles.topChromeChannelTriggerText}>
              {currentRenderableChannel?.name ?? "Select channel"} v
            </Text>
          </Pressable>
          {isChannelDropdownOpen ? (
            <View style={styles.topChromeChannelDropdown}>
              {textChannels.map((channel) => (
                <Pressable
                  key={channel.id}
                  onPress={() => {
                    void handleSelectChannel(channel);
                  }}
                  style={styles.topChromeChannelOption}
                >
                  <Text
                    style={[
                      styles.topChromeChannelOptionText,
                      currentRenderableChannel?.id === channel.id &&
                        styles.topChromeChannelOptionTextActive,
                    ]}
                  >
                    {channel.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        {/* EDIT END: slice 6 inline top chrome parity for haven + channel controls */}
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
    maxWidth: "85%",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#1F2937",
  },
  messageText: {
    color: "#E5E7EB",
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    marginHorizontal: MARGIN,
    marginBottom: MARGIN,
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: INPUT_HEIGHT,
    maxHeight: 120,
    color: "#F9FAFB",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 10,
    backgroundColor: "#1F2937",
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
    left: TOP_CHROME_MARGIN,
    right: TOP_CHROME_MARGIN,
    top: 0,
    zIndex: 20,
  },
  topChromePrimaryRow: {
    height: TOP_CHROME_ROW_HEIGHT,
    borderRadius: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topChromeCommunityTitle: {
    color: "#E5E7EB",
    fontWeight: "700",
    fontSize: 16,
  },
  topChromePrimaryAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  topChromePrimaryActionText: {
    color: "#D1D5DB",
    fontWeight: "600",
    fontSize: 12,
  },
  topChromeChannelTrigger: {
    marginTop: 6,
    height: TOP_CHROME_ROW_HEIGHT,
    borderRadius: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  topChromeChannelTriggerText: {
    color: "#E5E7EB",
    fontWeight: "600",
  },
  topChromeChannelDropdown: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#374151",
    overflow: "hidden",
  },
  topChromeChannelOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topChromeChannelOptionText: {
    color: "#D1D5DB",
  },
  topChromeChannelOptionTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
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
  // EDIT END: slice 5 reliability state styles
});
// EDIT END: local styles for fully in-line chat screen