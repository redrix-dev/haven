import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  EnrichedMarkdownText,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { useDmBubbleShellStore } from "@/features/direct-messages/stores/dmBubbleShellStore";
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
import { DmMessageActionsSheet } from "@/features/direct-messages/DmMessageActionsSheet";
import { DmReportSheet } from "@/features/direct-messages/DmReportSheet";

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DirectMessagesContainer() {
  const composerColors = useChatComposerColors();
  const { width: windowWidth } = useWindowDimensions();
  const liveProfiles = useLiveProfilesStore((s) => s.profiles);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [draft, setDraft] = useState("");
  const [isPickingDmMedia, setIsPickingDmMedia] = useState(false);
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [pendingDmMedia, setPendingDmMedia] = useState<CommunityMediaUploadPayload | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [dmReportTarget, setDmReportTarget] = useState<DirectMessage | null>(null);
  const [dmMessageActionsTarget, setDmMessageActionsTarget] = useState<DirectMessage | null>(null);

  const {
    state: {
      dmConversations,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmConversationsError,
      selectedDmConversationId,
      dmComposeDraftPeer,
      dmMessages,
      dmMessagesLoading,
      dmMessagesError,
    },
    derived: { selectedDmConversation },
    actions: {
      openDirectMessageConversation,
      clearSelectedDmConversation,
      clearDirectMessageDraft,
      sendDirectMessage,
      refreshDmConversations,
      toggleSelectedDmConversationMuted,
      reportDirectMessage,
    },
  } = useMobileDirectMessages();

  const dmComposeDraftPeerRef = useRef(dmComposeDraftPeer);
  dmComposeDraftPeerRef.current = dmComposeDraftPeer;

  useEffect(() => {
    return useDmBubbleShellStore.getState().subscribeBubbleCollapsed(() => {
      if (dmComposeDraftPeerRef.current) {
        clearDirectMessageDraft();
      }
    });
  }, [clearDirectMessageDraft]);

  const dismissDmComposerKeyboard = useCallback(() => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

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
            <View className="min-w-[22px] rounded-full bg-primary px-2 py-0.5">
              <Text className="text-center text-xs font-bold text-primary-foreground">{item.unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [liveProfiles, openDirectMessageConversation, otherLabel],
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
          onPress={dismissDmComposerKeyboard}
          onLongPress={
            !isSelf
              ? () => {
                  setDmMessageActionsTarget(item);
                }
              : undefined
          }
          style={bubbleMinWidth != null ? { minWidth: bubbleMinWidth } : undefined}
          className={`mb-2 max-w-[85%] ${isSelf ? "self-end" : "self-start"}`}
        >
          <View
            className={`rounded-2xl px-3 py-2 ${
              isSelf ? "bg-primary" : "bg-surface-panel"
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
    [currentUserId, dismissDmComposerKeyboard, windowWidth],
  );

  const dmActionsPeerLabel = useMemo(() => {
    if (dmComposeDraftPeer) return dmComposeDraftPeer.displayName;
    if (!selectedDmConversation) return undefined;
    return otherLabel(selectedDmConversation);
  }, [dmComposeDraftPeer, otherLabel, selectedDmConversation]);

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
    setIsSendingDm(true);
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
    } finally {
      setIsSendingDm(false);
    }
  }, [draft, pendingDmMedia, sendDirectMessage]);

  if (!selectedDmConversationId && !dmComposeDraftPeer) {
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

  const threadTitle = dmComposeDraftPeer
    ? dmComposeDraftPeer.displayName
    : selectedDmConversation
      ? otherLabel(selectedDmConversation)
      : "Chat";

  const canSendDmMessage = draft.trim().length > 0 || pendingDmMedia != null;

  return (
    <SafeAreaView
      edges={["bottom"]}
      className="min-h-0 flex-1 bg-card"
      style={{ flex: 1, minHeight: 0 }}
    >
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

      <ChatInterface
        keyboardScrollProps={{ keyboardLiftBehavior: "whenAtEnd" }}
        composerCollapsable={Platform.OS === "android" ? false : undefined}
        listPlaceholder={
          dmMessagesLoading && dmMessages.length === 0 && !dmComposeDraftPeer ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={composerColors.spinner} />
            </View>
          ) : undefined
        }
        data={orderedDmMessages}
        keyExtractor={(m) => m.messageId}
        renderItem={renderMessage}
        ListEmptyComponent={
          <Pressable
            onPress={dismissDmComposerKeyboard}
            className="min-h-[320px] flex-1 items-center justify-center px-4 pt-8"
          >
            {dmComposeDraftPeer ? (
              <Text className="text-center text-[13px] leading-5 text-muted-foreground">
                This is the beginning of your direct messages with {dmComposeDraftPeer.displayName}. Cheers to new
                friendships!
              </Text>
            ) : (
              <Text className="text-[13px] text-muted-foreground">No messages yet.</Text>
            )}
          </Pressable>
        }
        composer={
          <ChatComposer
            inputRef={composerInputRef}
            colors={composerColors}
            isSending={isSendingDm}
            isPickingMedia={isPickingDmMedia}
            canSend={canSendDmMessage}
            onChangeMarkdown={setDraft}
            onSend={() => void handleSend()}
            onPickMedia={() => void handlePickDmMedia()}
            strips={
              pendingDmMedia ? (
                <ChatMediaAttachmentStrip
                  fileName={pendingDmMedia.fileName}
                  iconColor={composerColors.iconMuted}
                  disabled={isSendingDm}
                  onRemove={() => setPendingDmMedia(null)}
                />
              ) : undefined
            }
          />
        }
      />

      <DmMessageActionsSheet
        visible={dmMessageActionsTarget !== null}
        onClose={() => setDmMessageActionsTarget(null)}
        peerLabel={dmActionsPeerLabel}
        onReport={() => {
          if (dmMessageActionsTarget) {
            setDmReportTarget(dmMessageActionsTarget);
          }
        }}
      />

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
