import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

// EDIT START: add local message model/constants for standalone in-line screen
type ChatMessage = { id: string; text: string };
type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;
const INPUT_HEIGHT = 42;
const INITIAL_MESSAGES: ChatMessage[] = [];
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
function Message({ text, onPress }: ChatMessage & { onPress?: () => void }) {
  return (
    <Pressable style={styles.messageRow} onPress={onPress}>
      <View style={styles.messageBubble}>
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

  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [draft, setDraft] = useState("");
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
  const topChromeTopInset = top + 8;
  const topChromeOccupiedHeight = topChromeHeight > 0 ? topChromeHeight : top + 108;
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
    const fromInput = composerInputRef.current ? await composerInputRef.current.getMarkdown() : draft;
    const text = fromInput.trim();
    if (!text) return;

    try {
      setIsSendingMessage(true);
      await messaging.actions.sendMessage(text);
      setDraft("");
      composerInputRef.current?.setValue("");
    } finally {
      setIsSendingMessage(false);
    }
  }, [draft, messaging.actions]);
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

  // EDIT START: slice 6 inline parity top chrome action handlers
  const handleOpenCommunitySettings = useCallback(() => {
    navigation.navigate("SettingsPlaceholder");
  }, [navigation]);

  const handleOpenCreateChannel = useCallback(() => {
    return;
  }, []);
  // EDIT END: slice 6 inline parity top chrome action handlers

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
            keyboardShouldPersistTaps="handled"
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
                onPress={() => {
                  composerInputRef.current?.blur();
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
              onPress={() => setIsChannelDropdownOpen((prev) => !prev)}
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
  topChromeChannelDropdown: {
    marginHorizontal: 12,
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