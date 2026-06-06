import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { ThemedIonicons } from "@/theme-rn";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
import { createChatMarkdownStyle } from "@/components/chat/chatTypography";
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { toInvertedChatOrder } from "@/components/chat/toInvertedChatOrder";
import { useDmBubbleShellStore } from "@/features/direct-messages/stores/dmBubbleShellStore";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useHavenCore } from "@shared/core";
import { useAuthStore } from "@shared/stores/authStore";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";
import { DmMessageActionsSheet } from "@/features/direct-messages/DmMessageActionsSheet";
import { DmReportSheet } from "@/features/direct-messages/DmReportSheet";
import { MessageImageAttachment } from "@/features/media/MessageImageAttachment";

type RefreshDmConversationsOptions = { suppressLoadingState?: boolean };

type SendDirectMessageOptions = {
  imageBody?: Blob;
  imageArrayBuffer?: ArrayBuffer;
  imageContentType?: string;
  imageFilename?: string;
  imageExpiresInHours?: number;
  optimisticAttachmentUri?: string | null;
};

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DirectMessagesContainer() {
  const composerColors = useChatComposerColors();
  const themeTokens = useMobileThemeTokens();
  const switchColors = useMemo(
    () => ({
      false: resolveColorProp(themeTokens, "border-panel") ?? "#3d4f6a",
      true: resolveColorProp(themeTokens, "primary") ?? "#4f8df5",
      thumb: resolveColorProp(themeTokens, "foreground") ?? "#e6edf7",
    }),
    [themeTokens],
  );
  const { width: windowWidth } = useWindowDimensions();
  const core = useHavenCore();
  const dm = core.directMessages;
  const liveProfiles = core.profiles.useProfilesRecord();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const dmConversations = dm.useConversations();
  const dmConversationsLoading = dm.useIsLoadingConversations();
  const selectedDmConversationId = dm.useActiveConversationId();
  const dmComposeDraftPeer = dm.useComposeDraftPeer();
  const dmMessages = dm.useMessages(selectedDmConversationId ?? "");
  const dmMessagesLoading = dm.useIsLoadingMessages(selectedDmConversationId ?? "");
  const [draft, setDraft] = useState("");
  const [isPickingDmMedia, setIsPickingDmMedia] = useState(false);
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [pendingDmMedia, setPendingDmMedia] = useState<CommunityMediaUploadPayload | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [dmReportTarget, setDmReportTarget] = useState<DirectMessage | null>(null);
  const [dmMessageActionsTarget, setDmMessageActionsTarget] = useState<DirectMessage | null>(null);
  const [dmConversationsRefreshing, setDmConversationsRefreshing] = useState(false);
  const [dmConversationsError, setDmConversationsError] = useState<string | null>(null);
  const [dmMessagesError, setDmMessagesError] = useState<string | null>(null);

  const selectedDmConversation = useMemo(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ??
          null)
        : null,
    [dmConversations, selectedDmConversationId],
  );

  const refreshDmConversations = useCallback(
    async (options?: RefreshDmConversationsOptions) => {
      if (options?.suppressLoadingState) setDmConversationsRefreshing(true);
      setDmConversationsError(null);
      try {
        await dm.loadConversations();
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, "Failed to load direct messages."));
      } finally {
        setDmConversationsRefreshing(false);
      }
    },
    [dm],
  );

  const openDirectMessageConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationId) throw new Error("DM conversation id is required.");
      setDmMessagesError(null);
      try {
        await dm.openConversation(conversationId, { markRead: true });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load direct messages.");
        setDmMessagesError(message);
        throw new Error(message);
      }
    },
    [dm],
  );

  const clearSelectedDmConversation = useCallback(() => {
    dm.clearFocusedConversation();
    setDmMessagesError(null);
  }, [dm]);

  const clearDirectMessageDraft = useCallback(() => {
    dm.setComposeDraftPeer(null);
    setDmMessagesError(null);
  }, [dm]);

  const sendDirectMessage = useCallback(
    async (content: string, options?: SendDirectMessageOptions) => {
      let activeConversationId = selectedDmConversationId;
      const draftPeer = dmComposeDraftPeer;
      if (!activeConversationId && draftPeer) {
        activeConversationId = await dm.getOrCreateDirectConversation(draftPeer.userId);
        dm.setComposeDraftPeer(null);
        dm.setActiveConversationId(activeConversationId);
        await refreshDmConversations({ suppressLoadingState: true });
      }
      if (!activeConversationId) throw new Error("No direct message conversation selected.");

      setDmMessagesError(null);
      try {
        const hasBlob = options?.imageBody != null;
        const hasBuffer = options?.imageArrayBuffer != null;
        if (hasBlob && hasBuffer) {
          throw new Error("Cannot send both imageBody and imageArrayBuffer.");
        }
        if (hasBuffer && !options.imageContentType?.trim()) {
          throw new Error("imageContentType is required when sending imageArrayBuffer.");
        }
        const inferredFilename =
          options?.imageFilename ??
          (options?.imageBody && "name" in options.imageBody
            ? String(options.imageBody.name)
            : undefined) ??
          `upload-${Date.now()}`;

        await dm.sendMessage(activeConversationId, content, {
          imageUpload: hasBuffer
            ? {
                body: options.imageArrayBuffer as ArrayBuffer,
                filename: inferredFilename,
                expiresInHours: options.imageExpiresInHours,
                contentType: options.imageContentType?.trim(),
              }
            : hasBlob
              ? {
                  body: options.imageBody as Blob,
                  filename: inferredFilename,
                  expiresInHours: options.imageExpiresInHours,
                }
              : undefined,
          optimisticAttachmentUri: options?.optimisticAttachmentUri ?? null,
        });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to send direct message.");
        setDmMessagesError(message);
        throw new Error(message);
      }
    },
    [dm, dmComposeDraftPeer, refreshDmConversations, selectedDmConversationId],
  );

  const toggleSelectedDmConversationMuted = useCallback(
    async (nextMuted: boolean) => {
      if (!selectedDmConversationId) {
        throw new Error("No direct message conversation selected.");
      }
      await dm.setMuted(selectedDmConversationId, nextMuted);
      await refreshDmConversations({ suppressLoadingState: true });
    },
    [dm, refreshDmConversations, selectedDmConversationId],
  );

  const reportDirectMessage = useCallback(
    async (input: Parameters<typeof dm.reportMessage>[0]) => {
      await dm.reportMessage(input);
    },
    [dm],
  );

  const dmComposeDraftPeerRef = useRef(dmComposeDraftPeer);
  dmComposeDraftPeerRef.current = dmComposeDraftPeer;

  useEffect(() => {
    return useDmBubbleShellStore.getState().subscribeBubbleCollapsed(() => {
      if (dmComposeDraftPeerRef.current) {
        clearDirectMessageDraft();
      }
    });
  }, [clearDirectMessageDraft]);

  useEffect(() => {
    if (!selectedDmConversationId) return;
    void core
      .prepareDirectMessageConversation(selectedDmConversationId, { markRead: false })
      .catch((error) => {
        console.error("Failed to load selected DM conversation:", error);
        setDmMessagesError(getErrorMessage(error, "Failed to load direct messages."));
      });
  }, [core, selectedDmConversationId]);

  useEffect(() => {
    if (!selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (conversation) => conversation.conversationId === selectedDmConversationId,
    );
    if (!stillExists) dm.setActiveConversationId(null);
  }, [dm, dmConversations, selectedDmConversationId]);

  const dismissDmComposerKeyboard = useCallback(() => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  // toInvertedChatOrder reverses ascending nexus order to descending for
  // ChatInterface's inverted FlatList (newest at data[0] = visual bottom).
  const orderedDmMessages = useMemo(() => toInvertedChatOrder(dmMessages), [dmMessages]);

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
          className="flex-row items-center gap-3 border-b border-border-panel py-3 active:bg-surface-hover"
        >
          <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface-panel">
            <Text className="text-lg font-semibold text-foreground">
              {title.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className={`text-base leading-6 ${unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground" numberOfLines={2}>
              {item.lastMessagePreview ?? "No messages yet"}
            </Text>
          </View>
          {unread ? (
            <View className="min-w-5.5 rounded-full bg-primary px-2 py-0.5">
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
      const markdownStyle = createChatMarkdownStyle({
        textColor,
        codeBackgroundColor: blockSurfaceColor,
        blockquoteBorderColor,
        linkColor,
      });
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
                ...markdownStyle,
                code: {
                  ...markdownStyle.code,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                },
                codeBlock: {
                  ...markdownStyle.codeBlock,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                },
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
                  <MessageImageAttachment
                    key={attachment.id}
                    image={{
                      id: attachment.id,
                      signedUrl: attachment.signedUrl,
                      originalFilename: attachment.originalFilename,
                    }}
                    images={(item.attachments ?? [])
                      .filter((candidate) => candidate.mediaKind === "image" && candidate.signedUrl)
                      .map((candidate) => ({
                        id: candidate.id,
                        signedUrl: candidate.signedUrl!,
                        originalFilename: candidate.originalFilename,
                      }))}
                    thumbnailStyle={styles.dmAttachmentImage}
                  />
                );
              }
              return null;
            })}
            <Text
              className="mt-1 text-xs leading-4"
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
              optimisticAttachmentUri: media.localUri,
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
          <Text className="mb-2 text-sm text-destructive">{dmConversationsError}</Text>
        ) : null}
        {dmConversationsLoading && dmConversations.length === 0 ? (
          <ActivityIndicator color={composerColors.spinner} />
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
    <View className="min-h-0 flex-1 bg-card" style={{ flex: 1, minHeight: 0 }}>
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => clearSelectedDmConversation()}
          className="flex-row items-center gap-1 active:opacity-80"
        >
          <ThemedIonicons name="chevron-back" size={24} colorClassName="accent-foreground" />
          <Text className="text-sm text-foreground">Inbox</Text>
        </Pressable>
        <Text className="max-w-[50%] flex-1 text-center text-base font-semibold leading-6 text-foreground" numberOfLines={2}>
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
              trackColor={{ false: switchColors.false, true: switchColors.true }}
              thumbColor={switchColors.thumb}
            />
          </View>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {dmMessagesError ? (
        <Text className="mb-2 text-sm text-destructive">{dmMessagesError}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  attachmentUnavailable: {
    marginTop: 8,
    // uniwind-theme-allow mobile-theme/no-raw-style-color - muted text color for unavailable attachment label
    color: "#9ba9bf",
    fontSize: 12,
  },
  dmAttachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginTop: 8,
    // uniwind-theme-allow mobile-theme/no-raw-style-color - image loading placeholder; semi-transparent black is intentional
    backgroundColor: "rgba(0,0,0,0.22)",
  },
});
