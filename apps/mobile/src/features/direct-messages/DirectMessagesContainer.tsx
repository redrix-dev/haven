import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type ScrollViewProps,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ChatScrollView } from "@/features/community/ChatScrollView";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useAuthStore } from "@shared/stores/authStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useMobileDirectMessages } from "@/contexts/MobileDirectMessagesContext";
import { DmReportSheet } from "@/features/direct-messages/DmReportSheet";

const MARGIN = 8;
/** DM composer: keep internal scrolling off until native layout hits max height so the pill grows every line. */
const DM_COMPOSER_INPUT_MIN_HEIGHT = 36;
const DM_COMPOSER_INPUT_MAX_HEIGHT = 120;
const COMPOSER_CHROME_IMMERSIVE_OPACITY = 0.38;
const COMPOSER_CHROME_REST_OPACITY = 1;
const COMPOSER_CHROME_IMMERSIVE_MS = 140;
const COMPOSER_CHROME_REST_MS = 280;
const COMPOSER_CHROME_SETTLE_MS = 200;

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DirectMessagesContainer() {
  const { width: windowWidth } = useWindowDimensions();
  const liveProfiles = useLiveProfilesStore((s) => s.profiles);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [draft, setDraft] = useState("");
  const [isPickingDmMedia, setIsPickingDmMedia] = useState(false);
  const [pendingDmMedia, setPendingDmMedia] = useState<CommunityMediaUploadPayload | null>(null);
  const { bottom } = useSafeAreaInsets();
  /** Full composer stack height; passed as KeyboardChatScrollView `extraContentPadding` so inset + scroll track growth (see library docs). */
  const composerHeight = useSharedValue(0);
  const composerChromeOpacity = useSharedValue(COMPOSER_CHROME_REST_OPACITY);
  const listDragRef = useRef(false);
  const listMomentumRef = useRef(false);
  const composerSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [dmReportTarget, setDmReportTarget] = useState<DirectMessage | null>(null);
  const [dmComposerInputScrollEnabled, setDmComposerInputScrollEnabled] = useState(false);

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

  useEffect(() => {
    setDmComposerInputScrollEnabled(false);
  }, [selectedDmConversationId]);

  const clearComposerSettleTimer = useCallback(() => {
    if (composerSettleTimerRef.current != null) {
      clearTimeout(composerSettleTimerRef.current);
      composerSettleTimerRef.current = null;
    }
  }, []);

  const goComposerChromeImmersive = useCallback(() => {
    clearComposerSettleTimer();
    composerChromeOpacity.value = withTiming(COMPOSER_CHROME_IMMERSIVE_OPACITY, {
      duration: COMPOSER_CHROME_IMMERSIVE_MS,
    });
  }, [clearComposerSettleTimer]);

  const scheduleComposerChromeRest = useCallback(() => {
    clearComposerSettleTimer();
    composerSettleTimerRef.current = setTimeout(() => {
      composerSettleTimerRef.current = null;
      if (!listDragRef.current && !listMomentumRef.current) {
        composerChromeOpacity.value = withTiming(COMPOSER_CHROME_REST_OPACITY, {
          duration: COMPOSER_CHROME_REST_MS,
        });
      }
    }, COMPOSER_CHROME_SETTLE_MS);
  }, [clearComposerSettleTimer]);

  useEffect(() => () => clearComposerSettleTimer(), [clearComposerSettleTimer]);

  const composerChromeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: composerChromeOpacity.value,
  }));

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
      <ChatScrollView {...props} extraContentPadding={composerHeight} />
    ),
    [composerHeight],
  );

  const renderMessage: ListRenderItem<DirectMessage> = useCallback(
    ({ item }) => {
      const isSelf = currentUserId != null && item.authorUserId === currentUserId;
      const hasRenderableImage =
        item.attachments?.some((a) => a.mediaKind === "image" && a.signedUrl) ?? false;
      /** Avoid a narrow bubble (text-only width) forcing wide photos into a thin cropped strip. */
      const bubbleMinWidth = hasRenderableImage
        ? Math.min(windowWidth * 0.72, 360)
        : undefined;
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
          style={bubbleMinWidth != null ? { minWidth: bubbleMinWidth } : undefined}
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
            {item.attachments?.map((attachment) => {
              if (!attachment.signedUrl) {
                return (
                  <Text key={attachment.id} style={styles.attachmentUnavailable}>
                    Attachment unavailable.
                  </Text>
                );
              }
              if (attachment.mediaKind === "image") {
                return (
                  <Image
                    key={attachment.id}
                    source={{ uri: attachment.signedUrl }}
                    style={styles.dmAttachmentImage}
                    resizeMode="contain"
                  />
                );
              }
              return null;
            })}
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
    [currentUserId, windowWidth],
  );

  const handlePickDmMedia = useCallback(async () => {
    if (isPickingDmMedia) return;
    setIsPickingDmMedia(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow Photos access to attach an image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
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
      if (!payload.contentType.trim().toLowerCase().startsWith("image/")) {
        Alert.alert("Not supported", "Direct messages only support image attachments.");
        return;
      }
      setPendingDmMedia(payload);
    } catch (e) {
      Alert.alert("Could not add image", getErrorMessage(e, "Choose a different photo."));
    } finally {
      setIsPickingDmMedia(false);
    }
  }, [isPickingDmMedia]);

  const handleSend = useCallback(async () => {
    const fromInput = composerInputRef.current
      ? await composerInputRef.current.getMarkdown()
      : draft;
    const text = fromInput.trim();
    if (!text && !pendingDmMedia) return;
    const media = pendingDmMedia;
    setDraft("");
    composerInputRef.current?.setValue("");
    setPendingDmMedia(null);
    try {
      await sendDirectMessage(text, {
        ...(media
          ? {
              imageArrayBuffer: media.body,
              imageContentType: media.contentType,
              imageFilename: media.fileName,
            }
          : {}),
      });
    } catch (e) {
      setDraft(text);
      composerInputRef.current?.setValue(text);
      if (media) setPendingDmMedia(media);
      Alert.alert("Send failed", getErrorMessage(e, "Could not send message."));
    }
  }, [draft, pendingDmMedia, sendDirectMessage]);

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
          onScrollBeginDrag={() => {
            listDragRef.current = true;
            goComposerChromeImmersive();
          }}
          onScrollEndDrag={() => {
            listDragRef.current = false;
            scheduleComposerChromeRest();
          }}
          onMomentumScrollBegin={() => {
            listMomentumRef.current = true;
            goComposerChromeImmersive();
          }}
          onMomentumScrollEnd={() => {
            listMomentumRef.current = false;
            scheduleComposerChromeRest();
          }}
          renderScrollComponent={renderScrollComponent}
          contentContainerStyle={{ paddingTop: 32 }}
          ListEmptyComponent={
            <View className="items-center pt-8">
              <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
            </View>
          }
        />
      )}

      <KeyboardStickyView
        offset={{ opened: bottom + MARGIN }}
        style={{
          position: "absolute",
          width: "100%",
          bottom: -MARGIN,
        }}
      >
        <View
          collapsable={Platform.OS === "android" ? false : undefined}
          onLayout={(e) => {
            composerHeight.value = e.nativeEvent.layout.height;
          }}
        >
          {pendingDmMedia ? (
            <View className="flex-row items-center gap-2 border-t border-white/[0.08] bg-surface-modal/90 px-3 py-2">
              <Ionicons name="attach" size={16} color="#8b9cbb" />
              <Text className="min-w-0 flex-1 text-xs text-foreground/90" numberOfLines={1}>
                {pendingDmMedia.fileName}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => setPendingDmMedia(null)}
                className="shrink-0"
              >
                <Text className="text-xs font-semibold text-primary">Remove</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="flex-row items-end bg-transparent px-3 pt-2.5 pb-3 gap-2">
            <Animated.View style={composerChromeAnimatedStyle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add image"
                disabled={isPickingDmMedia}
                onPress={() => void handlePickDmMedia()}
                className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mb-0.5 disabled:opacity-50"
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
            </Animated.View>

            <Animated.View
              style={[{ flex: 1, flexDirection: "row", alignItems: "flex-end" }, composerChromeAnimatedStyle]}
            >
              <View className="flex-1 flex-row items-end rounded-[18px] border border-white/10 bg-white/[0.08] pr-1.5">
                <View
                  collapsable={Platform.OS === "android" ? false : undefined}
                  className="min-w-0 flex-1"
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    const nextScroll = h >= DM_COMPOSER_INPUT_MAX_HEIGHT - 0.5;
                    setDmComposerInputScrollEnabled((prev) => (prev === nextScroll ? prev : nextScroll));
                  }}
                >
                  <EnrichedMarkdownTextInput
                    ref={composerInputRef}
                    multiline
                    scrollEnabled={dmComposerInputScrollEnabled}
                    defaultValue=""
                    onChangeMarkdown={setDraft}
                    placeholder="Message"
                    placeholderTextColor="#8e8e93"
                    cursorColor="#e6edf7"
                    selectionColor="rgba(63, 121, 216, 0.4)"
                    markdownStyle={{
                      strong: { color: "#e6edf7" },
                      em: { color: "#e6edf7" },
                      link: { color: "#3F79D8", underline: true },
                      spoiler: { color: "#a9b8cf", backgroundColor: "rgba(0,0,0,0.2)" },
                    }}
                    style={{
                      width: "100%",
                      minHeight: DM_COMPOSER_INPUT_MIN_HEIGHT,
                      maxHeight: DM_COMPOSER_INPUT_MAX_HEIGHT,
                      color: "#e6edf7",
                      paddingHorizontal: 14,
                      paddingTop: 8,
                      paddingBottom: 8,
                      fontSize: 16,
                      backgroundColor: "transparent",
                    }}
                  />
                </View>
                {draft.trim().length > 0 || pendingDmMedia != null ? (
                  <Pressable
                    onPress={() => void handleSend()}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    className="w-10 h-10 rounded-full bg-primary items-center justify-center mb-0.5"
                  >
                    <Ionicons name="arrow-up" size={22} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
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

const styles = StyleSheet.create({
  attachmentUnavailable: {
    marginTop: 8,
    color: "#9ba9bf",
    fontSize: 12,
  },
  dmAttachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
});
