import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItem,
  type ScrollViewProps,
} from "react-native";
import { EnrichedMarkdownText, EnrichedMarkdownTextInput, type EnrichedMarkdownTextInputInstance } from "react-native-enriched-markdown";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ChatScrollView } from "@/features/community/ChatScrollView";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@shared/stores/authStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { DmReportSheet } from "@/features/direct-messages/DmReportSheet";

const MARGIN = 8;

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DirectMessagesContainer() {
  const liveProfiles = useLiveProfilesStore((s) => s.profiles);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [draft, setDraft] = useState("");
  const { bottom } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const adjustedBlankSpace = useDerivedValue(() => composerHeight.value - bottom);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [dmReportTarget, setDmReportTarget] = useState<DirectMessage | null>(null);

  const {
    state: {
      dmConversations,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmConversationsError,
      selectedDmConversationId,
      dmMessages,
      dmMessagesLoading,
      dmMessagesError,
      dmMessageSendPending,
    },
    derived: { selectedDmConversation },
    actions: {
      openDirectMessageConversation,
      clearSelectedDmConversation,
      sendDirectMessage,
      refreshDmConversations,
      toggleSelectedDmConversationMuted,
      reportDirectMessage,
    },
  } = useMobileDirectMessages();

  const orderedDmMessages = useMemo(() => [...dmMessages].reverse(), [dmMessages]);

  const otherLabel = useCallback(
    (c: DirectMessageConversationSummary) => {
      const uid = c.otherUserId;
      const name =
        resolveLiveUsername(liveProfiles, uid, c.otherUsername)?.trim() || c.otherUsername || "Direct";
      return name;
    },
    [liveProfiles],
  );

  const renderConversation: ListRenderItem<DirectMessageConversationSummary> = useCallback(
    ({ item }) => {
      const unread = item.unreadCount > 0;
      const title = otherLabel(item);
      return (
        <Pressable
          onPress={() => void openDirectMessageConversation(item.conversationId)}
          className="flex-row items-center gap-3 border-b border-border py-3 active:bg-surface-hover"
        >
          <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
            <Text className="text-lg font-semibold text-foreground">
              {title.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className={`text-base ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {item.lastMessagePreview ?? "No messages yet"}
            </Text>
          </View>
          {unread ? (
            <View className="min-w-[22px] rounded-full bg-accent-slider px-2 py-0.5">
              <Text className="text-center text-xs font-bold text-white">{item.unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [liveProfiles, openDirectMessageConversation, otherLabel],
  );

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView {...props} blankSpace={adjustedBlankSpace} />
    ),
    [adjustedBlankSpace],
  );

  const renderMessage: ListRenderItem<DirectMessage> = useCallback(
    ({ item }) => {
      const isSelf = currentUserId != null && item.authorUserId === currentUserId;
      const textColor = isSelf ? "#ffffff" : "#e6edf7";
      const mutedTextColor = isSelf ? "rgba(255,255,255,0.8)" : "#8b9cbb";
      const blockSurfaceColor = isSelf ? "rgba(12, 20, 34, 0.35)" : "#1a2235";
      const blockquoteBorderColor = isSelf ? "rgba(255,255,255,0.65)" : "#3F79D8";
      const linkColor = isSelf ? "#ffffff" : "#3F79D8";
      return (
        <Pressable
          onPress={() => composerInputRef.current?.blur()}
          onLongPress={
            !isSelf
              ? () => {
                  setDmReportTarget(item);
                }
              : undefined
          }
          className={`mb-2 max-w-[85%] ${isSelf ? "self-end" : "self-start"}`}
        >
          <View
            className={`rounded-2xl px-3 py-2 ${
              isSelf ? "bg-accent-slider" : "bg-surface-panel"
            }`}
          >
            <EnrichedMarkdownText
              markdown={item.content}
              flavor="github"
              md4cFlags={{ underline: true }}
              markdownStyle={{
                paragraph: { color: textColor, fontSize: 14, lineHeight: 20 },
                h1: { fontSize: 22, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 4, lineHeight: 28 },
                h2: { fontSize: 18, fontWeight: "700", color: textColor, marginTop: 4, marginBottom: 4, lineHeight: 24 },
                h3: { fontSize: 16, fontWeight: "600", color: textColor, marginTop: 4, marginBottom: 2, lineHeight: 22 },
                strong: { color: textColor },
                em: { color: textColor },
                code: {
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  fontSize: 13,
                  backgroundColor: blockSurfaceColor,
                  color: textColor,
                  borderColor: blockSurfaceColor,
                },
                codeBlock: {
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  fontSize: 13,
                  backgroundColor: blockSurfaceColor,
                  color: textColor,
                  padding: 10,
                  borderRadius: 6,
                  marginTop: 4,
                  marginBottom: 4,
                },
                blockquote: {
                  backgroundColor: blockSurfaceColor,
                  borderColor: blockquoteBorderColor,
                  borderWidth: 3,
                  gapWidth: 10,
                  marginTop: 2,
                  marginBottom: 2,
                },
                strikethrough: { color: textColor },
                list: { marginTop: 2, marginBottom: 2 },
                link: { color: linkColor, underline: true },
              }}
              onLinkPress={({ url }) => {
                void Linking.openURL(url);
              }}
            />
            <Text
              className="mt-1 text-[10px]"
              style={{ color: mutedTextColor }}
            >
              {formatDmTime(item.createdAt)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [currentUserId],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || dmMessageSendPending) return;
    setDraft("");
    composerInputRef.current?.setValue("");
    void sendDirectMessage(text).catch(() => {
      setDraft(text);
    });
  }, [draft, dmMessageSendPending, sendDirectMessage]);

  if (!selectedDmConversationId) {
    return (
      <View className="min-h-0 flex-1">
        {dmConversationsError ? (
          <Text className="mb-2 text-sm text-red-400">{dmConversationsError}</Text>
        ) : null}
        {dmConversationsLoading && dmConversations.length === 0 ? (
          <ActivityIndicator color="#e6edf7" />
        ) : (
          <FlatList
            data={dmConversations}
            keyExtractor={(c) => c.conversationId}
            renderItem={renderConversation}
            refreshing={dmConversationsRefreshing}
            onRefresh={() => void refreshDmConversations({ suppressLoadingState: true })}
            ListEmptyComponent={
              <Text className="py-8 text-center text-muted-foreground">
                No direct messages yet.
              </Text>
            }
          />
        )}
      </View>
    );
  }

  const threadTitle = selectedDmConversation ? otherLabel(selectedDmConversation) : "Chat";

  return (
    <SafeAreaView edges={["bottom"]} className="min-h-0 flex-1 bg-card">
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => clearSelectedDmConversation()}
          className="flex-row items-center gap-1 active:opacity-80"
        >
          <Ionicons name="chevron-back" size={24} color="#e6edf7" />
          <Text className="text-sm text-foreground">Inbox</Text>
        </Pressable>
        <Text className="max-w-[50%] flex-1 text-center text-base font-semibold text-foreground" numberOfLines={1}>
          {threadTitle}
        </Text>
        {selectedDmConversation ? (
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground">Mute</Text>
            <Switch
              value={selectedDmConversation.isMuted}
              onValueChange={(v) => {
                void toggleSelectedDmConversationMuted(v);
              }}
              trackColor={{ false: "#3d4f6a", true: "#4f8df5" }}
            />
          </View>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {dmMessagesError ? (
        <Text className="mb-2 text-sm text-red-400">{dmMessagesError}</Text>
      ) : null}

      {dmMessagesLoading && dmMessages.length === 0 ? (
        <ActivityIndicator color="#e6edf7" />
      ) : (
        <FlatList
          className="flex-1"
          data={orderedDmMessages}
          keyExtractor={(m) => m.messageId}
          renderItem={renderMessage}
          inverted
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          renderScrollComponent={renderScrollComponent}
          contentContainerStyle={{ paddingTop: 8 }}
          ListEmptyComponent={
            <View className="items-center pt-8">
              <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
            </View>
          }
        />
      )}

      <KeyboardStickyView
        offset={{ opened: bottom - MARGIN }}
        onLayout={(e) => {
          composerHeight.value = e.nativeEvent.layout.height;
        }}
      >
        <View className="flex-row items-end gap-2 bg-transparent px-3 pt-2.5 pb-3 gap-2">
          <Pressable className="w-[34px] h-[34px] rounded-full bg-white/10 items-center justify-center mb-0.5">
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
          
          <View className="flex-1 flex-row items-end rounded-[18px] border border-white/10 bg-white/[0.08] pr-1">
            <EnrichedMarkdownTextInput
              ref={composerInputRef}
              multiline
              editable={!dmMessageSendPending}
              scrollEnabled
              defaultValue=""
              onChangeMarkdown={setDraft}
              placeholder="Message"
              placeholderTextColor="#8b9cbb"
              cursorColor="#e6edf7"
              selectionColor="rgba(63, 121, 216, 0.4)"
              markdownStyle={{
                strong: { color: "#e6edf7" },
                em: { color: "#e6edf7" },
                link: { color: "#3F79D8", underline: true },
                spoiler: { color: "#a9b8cf", backgroundColor: "rgba(0,0,0,0.2)" },
              }}
              style={{
                flex: 1,
                minHeight: 36,
                maxHeight: 120,
                color: "#e6edf7",
                paddingHorizontal: 14,
                paddingTop: 8,
                paddingBottom: 8,
                fontSize: 16,
                backgroundColor: "transparent",
              }}
            />
            {draft.trim().length > 0 ? (
              <Pressable
                onPress={() => void handleSend()}
                disabled={dmMessageSendPending}
                className="w-7 h-7 rounded-full bg-accent-slider items-center justify-center mb-1"
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </Pressable>
            ) : null}
            </View>
          </View>
      </KeyboardStickyView>

      <DmReportSheet
        visible={dmReportTarget !== null}
        onClose={() => setDmReportTarget(null)}
        authorUsername={dmReportTarget?.authorUsername?.trim() || "User"}
        messagePreview={dmReportTarget?.content ?? ""}
        onSubmit={async (input) => {
          if (!dmReportTarget) return;
          await reportDirectMessage({
            messageId: dmReportTarget.messageId,
            ...input,
          });
        }}
      />
    </SafeAreaView>
  );
}
