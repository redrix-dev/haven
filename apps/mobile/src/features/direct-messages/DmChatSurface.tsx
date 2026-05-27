import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
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
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { useDmBubbleShellStore } from "@/features/direct-messages/stores/dmBubbleShellStore";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import type { DirectMessage, DirectMessageConversationSummary } from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { resolveLiveUsername } from "@shared/lib/liveProfiles";
import { useHavenCore } from "@shared/core";
import { useAuthStore } from "@shared/stores/authStore";
import { DmMessageActionsSheet } from "@/features/direct-messages/DmMessageActionsSheet";
import { DmReportSheet } from "@/features/direct-messages/DmReportSheet";

function formatDmTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function DmChatSurface() {
  const composerColors = useChatComposerColors();
  const { width: windowWidth } = useWindowDimensions();
  const core = useHavenCore();
  const dm = core.directMessages;
  const liveProfiles = core.profiles.useProfilesRecord();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const selectedDmConversationId = dm.useActiveConversationId();
  const dmComposeDraftPeer = dm.useComposeDraftPeer();
  const dmConversations = dm.useConversations();
  const dmMessages = dm.useMessages(selectedDmConversationId ?? "");
  const dmMessagesLoading = dm.useIsLoadingMessages(selectedDmConversationId ?? "");

  const [draft, setDraft] = useState("");
  const [isPickingDmMedia, setIsPickingDmMedia] = useState(false);
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [pendingDmMedia, setPendingDmMedia] = useState<CommunityMediaUploadPayload | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [dmReportTarget, setDmReportTarget] = useState<DirectMessage | null>(null);
  const [dmMessageActionsTarget, setDmMessageActionsTarget] = useState<DirectMessage | null>(null);
  const [dmMessagesError, setDmMessagesError] = useState<string | null>(null);

  const selectedDmConversation = useMemo<DirectMessageConversationSummary | null>(
    () =>
      selectedDmConversationId
        ? (dmConversations.find((c) => c.conversationId === selectedDmConversationId) ?? null)
        : null,
    [dmConversations, selectedDmConversationId],
  );

  // Load conversation messages when active conversation changes
  useEffect(() => {
    if (!selectedDmConversationId) return;
    void core
      .prepareDirectMessageConversation(selectedDmConversationId, { markRead: false })
      .catch((error) => {
        console.error("Failed to load selected DM conversation:", error);
        setDmMessagesError(getErrorMessage(error, "Failed to load messages."));
      });
  }, [core, selectedDmConversationId]);

  // Clear active conversation if it disappears from the list
  useEffect(() => {
    if (!selectedDmConversationId) return;
    const stillExists = dmConversations.some(
      (c) => c.conversationId === selectedDmConversationId,
    );
    if (!stillExists) dm.setActiveConversationId(null);
  }, [dm, dmConversations, selectedDmConversationId]);

  // Clear draft peer when the floating bubble shell collapses
  const clearDirectMessageDraft = useCallback(() => {
    dm.setComposeDraftPeer(null);
    setDmMessagesError(null);
  }, [dm]);

  const dmComposeDraftPeerRef = useRef(dmComposeDraftPeer);
  dmComposeDraftPeerRef.current = dmComposeDraftPeer;

  useEffect(() => {
    return useDmBubbleShellStore.getState().subscribeBubbleCollapsed(() => {
      if (dmComposeDraftPeerRef.current) {
        clearDirectMessageDraft();
      }
    });
  }, [clearDirectMessageDraft]);

  // ── Send logic ───────────────────────────────────────────────────────────

  const sendDirectMessage = useCallback(
    async (
      content: string,
      options?: {
        imageBody?: Blob;
        imageArrayBuffer?: ArrayBuffer;
        imageContentType?: string;
        imageFilename?: string;
        imageExpiresInHours?: number;
      },
    ) => {
      let activeConversationId = selectedDmConversationId;
      const draftPeer = dmComposeDraftPeer;

      if (!activeConversationId && draftPeer) {
        activeConversationId = await dm.getOrCreateDirectConversation(draftPeer.userId);
        dm.setComposeDraftPeer(null);
        dm.setActiveConversationId(activeConversationId);
        // Refresh conversation list after creating a new conversation
        await dm.loadConversations();
      }
      if (!activeConversationId) throw new Error("No direct message conversation selected.");

      setDmMessagesError(null);
      const hasBlob = options?.imageBody != null;
      const hasBuffer = options?.imageArrayBuffer != null;
      if (hasBlob && hasBuffer) throw new Error("Cannot send both imageBody and imageArrayBuffer.");
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
      });
    },
    [dm, dmComposeDraftPeer, selectedDmConversationId],
  );

  const reportDirectMessage = useCallback(
    async (input: Parameters<typeof dm.reportMessage>[0]) => {
      await dm.reportMessage(input);
    },
    [dm],
  );

  // ── Media picker ─────────────────────────────────────────────────────────

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

  // ── Send handler ─────────────────────────────────────────────────────────

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

  // ── Message rendering ─────────────────────────────────────────────────────

  const dismissDmComposerKeyboard = useCallback(() => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const orderedDmMessages = useMemo(() => [...dmMessages].reverse(), [dmMessages]);

  const dmActionsPeerLabel = useMemo(() => {
    if (dmComposeDraftPeer) return dmComposeDraftPeer.displayName;
    if (!selectedDmConversation) return undefined;
    return (
      resolveLiveUsername(
        liveProfiles,
        selectedDmConversation.otherUserId,
        selectedDmConversation.otherUsername,
      )?.trim() ||
      selectedDmConversation.otherUsername ||
      "Direct"
    );
  }, [dmComposeDraftPeer, liveProfiles, selectedDmConversation]);

  const renderMessage: ListRenderItem<DirectMessage> = useCallback(
    ({ item }) => {
      const isSelf = currentUserId != null && item.authorUserId === currentUserId;
      const hasRenderableImage =
        item.attachments?.some((a) => a.mediaKind === "image" && a.signedUrl) ?? false;
      const bubbleMinWidth = hasRenderableImage ? Math.min(windowWidth * 0.72, 360) : undefined;
      // These colors are bubble-specific (depend on self vs other) and are passed to
      // EnrichedMarkdownText's markdownStyle which requires actual color values.
      const textColor = isSelf ? "#ffffff" : "#e6edf7";
      const mutedTextColor = isSelf ? "rgba(255,255,255,0.8)" : "#8b9cbb";
      const blockSurfaceColor = isSelf ? "rgba(12, 20, 34, 0.35)" : "#1a2235";
      const blockquoteBorderColor = isSelf ? "rgba(255,255,255,0.65)" : "#3F79D8";
      const linkColor = isSelf ? "#ffffff" : "#3F79D8";
      return (
        <Pressable
          onPress={dismissDmComposerKeyboard}
          onLongPress={
            !isSelf ? () => { setDmMessageActionsTarget(item); } : undefined
          }
          style={bubbleMinWidth != null ? { minWidth: bubbleMinWidth } : undefined}
          className={`mb-2 max-w-[85%] ${isSelf ? "self-end" : "self-start"}`}
        >
          <View className={`rounded-2xl px-3 py-2 ${isSelf ? "bg-primary" : "bg-surface-panel"}`}>
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
              onLinkPress={({ url }) => { void Linking.openURL(url); }}
            />
            {item.attachments?.map((attachment) => {
              if (!attachment.signedUrl) {
                return (
                  <Text
                    key={attachment.id}
                    className="mt-2 text-xs text-muted-foreground"
                  >
                    Attachment unavailable.
                  </Text>
                );
              }
              if (attachment.mediaKind === "image") {
                return (
                  <Image
                    key={attachment.id}
                    source={{ uri: attachment.signedUrl }}
                    style={{
                      width: "100%",
                      height: 220,
                      borderRadius: 12,
                      marginTop: 8,
                      backgroundColor: "rgba(0,0,0,0.22)",
                    }}
                    resizeMode="contain"
                  />
                );
              }
              return null;
            })}
            <Text className="mt-1 text-[10px]" style={{ color: mutedTextColor }}>
              {formatDmTime(item.createdAt)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [currentUserId, dismissDmComposerKeyboard, windowWidth],
  );

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!selectedDmConversationId && !dmComposeDraftPeer) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ThemedIonicons name="chatbubble-ellipses-outline" size={48} colorClassName="accent-muted-foreground" />
        <Text className="mt-4 text-base text-muted-foreground">Select a conversation</Text>
      </View>
    );
  }

  // ── Chat surface ──────────────────────────────────────────────────────────

  const canSendDmMessage = draft.trim().length > 0 || pendingDmMedia != null;

  return (
    <View className="min-h-0 flex-1 bg-card">
      {dmMessagesError ? (
        <Text className="px-4 pt-2 text-xs text-destructive">{dmMessagesError}</Text>
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
                This is the beginning of your direct messages with {dmComposeDraftPeer.displayName}.
                Cheers to new friendships!
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
          if (dmMessageActionsTarget) setDmReportTarget(dmMessageActionsTarget);
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
