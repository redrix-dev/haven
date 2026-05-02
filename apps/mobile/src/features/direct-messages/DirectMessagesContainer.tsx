import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItem,
  type ScrollViewProps,
} from "react-native";
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
  const composerInputRef = useRef<TextInput | null>(null);
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
      const isSelf =
        currentUserId != null && item.authorUserId === currentUserId;
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
            <Text className={`text-sm ${isSelf ? "text-white" : "text-foreground"}`}>
              {item.content}
            </Text>
            <Text
              className={`mt-1 text-[10px] ${isSelf ? "text-white/80" : "text-muted-foreground"}`}
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
          data={dmMessages}
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
        <View className="flex-row items-end gap-2 bg-transparent pt-2.5 pb-1">
          <TextInput
            ref={composerInputRef}
            className="max-h-28 min-h-11 flex-1 rounded-xl border border-border bg-surface-panel px-3 py-2 text-foreground"
            placeholder="Message"
            placeholderTextColor="#8b9cbb"
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!dmMessageSendPending}
          />
          <Pressable
            accessibilityRole="button"
            disabled={dmMessageSendPending || !draft.trim()}
            onPress={handleSend}
            className="rounded-xl bg-accent-slider px-4 py-3 disabled:opacity-50"
          >
            <Text className="font-semibold text-white">Send</Text>
          </Pressable>
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
