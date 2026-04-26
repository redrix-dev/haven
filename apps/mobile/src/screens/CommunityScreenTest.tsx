import React, { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import type { Message } from "@shared/lib/backend/types";
import type { KeyboardChatScrollViewProps } from "react-native-keyboard-controller";
import { useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// EDIT START: add local message model/constants for standalone in-line screen
type ChatMessage = { id: string; text: string };
type Ref = React.ElementRef<typeof KeyboardChatScrollView>;

const MARGIN = 8;
const INPUT_HEIGHT = 42;
const INITIAL_MESSAGES: ChatMessage[] = [];
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
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;
  const { servers } = useServers();
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
  const { bottom } = useSafeAreaInsets();
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

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <KeyboardGestureArea
        interpolator="ios"
        offset={INPUT_HEIGHT}
        style={styles.container}
        textInputNativeID="chat-input"
      >
        <FlatList
          data={messages}
          inverted
          contentContainerStyle={{ paddingTop: 10 }}
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
});
// EDIT END: local styles for fully in-line chat screen