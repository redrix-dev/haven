import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import type { Channel } from "@shared/lib/backend/types";
import { useAuthStore } from "@shared/stores/authStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useServers } from "@shared/features/community/hooks/useServers";
import { useCurrentServerPermissionUi } from "@shared/features/community/hooks/useCurrentServerPermissionUi";
import { getCommunityDataBackend } from "@shared/lib/backend";
import { getErrorMessage } from "@platform/lib/errors";
import {
  buildChatListItemsFromChatMessages,
  buildMessageBundleById,
  getReplyTargetLabel,
  mapBundlesToChatMessages,
} from "@/features/community/communityChannelChatFromBundles";
import { setLastTextChannelIdForCommunity } from "@/storage/communityChannelPrefs";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
import { ChatReplyStrip } from "@/components/chat/ChatReplyStrip";
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { CommunityChannelBar } from "@/features/community/CommunityChannelBar";
import {
  CommunityMessageBubble,
  MessageDateDivider,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";
import { ChannelSwitcherModal } from "@/features/community/ChannelSwitcherModal";
import { CommunityPhaseGate } from "@/features/community/CommunityPhaseGate";
import {
  MessageActionsSheet,
  type MessageActionTarget,
} from "@/features/community/MessageActionsSheet";
import { CommunityReportMessageModal } from "@/features/community/CommunityReportMessageModal";
import { BanUserModal } from "@/features/community/BanUserModal";
import { MobileServerSettingsModal } from "@/features/community/settings/MobileServerSettingsModal";
import { MobileChannelSettingsModal } from "@/features/community/settings/MobileChannelSettingsModal";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import { SafeAreaView } from "react-native-safe-area-context";

export function CommunityScreen() {
  const composerColors = useChatComposerColors();
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);

  // ── Auth + navigation store ──
  const communityId = useNavigationStore((state) => state.currentServerId) ?? null;
  const setCurrentChannelId = useNavigationStore((state) => state.setCurrentChannelId);
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  const { serverPermissions, canOpenServerSettings } = useCurrentServerPermissionUi(communityId);
  const canOpenChannelSettings =
    serverPermissions.canManageChannelStructure || serverPermissions.canManageChannelPermissions;

  // ── Servers + workspace ──
  const { servers, status: serversStatus, error: serversError, refreshServers } = useServers();
  const {
    state: { channels },
    derived: { currentRenderableChannel },
  } = useCommunityWorkspace({ servers, currentUserId });

  // ── Messaging ──
  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: currentRenderableChannel?.id ?? null,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });

  // ── Stores ──
  const storedMessages = useMessagesStore((state) => state.messages);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);

  // ── Derived data ──
  const community = useMemo(
    () => (communityId ? servers.find((s) => s.id === communityId) ?? null : null),
    [communityId, servers],
  );

  const messageById = useMemo(() => buildMessageBundleById(storedMessages), [storedMessages]);

  const messages = useMemo<ChatMessage[]>(
    () => mapBundlesToChatMessages(storedMessages, liveProfiles),
    [liveProfiles, storedMessages],
  );

  const chatListItems = useMemo<ChatListItem[]>(
    () => buildChatListItemsFromChatMessages(messages),
    [messages],
  );

  // ── Channel resolution ──
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [messageActionsTarget, setMessageActionsTarget] = useState<MessageActionTarget | null>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; username: string } | null>(null);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);

  const handleSelectChannel = useCallback(
    async (channel: Channel) => {
      if (!communityId) return;
      setCurrentChannelId(channel.id);
      await setLastTextChannelIdForCommunity(communityId, channel.id);
      setIsChannelDropdownOpen(false);
    },
    [communityId, setCurrentChannelId],
  );

  // ── Composer state ──
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isPickingCommunityMedia, setIsPickingCommunityMedia] = useState(false);
  const [pendingCommunityMedia, setPendingCommunityMedia] = useState<CommunityMediaUploadPayload | null>(
    null,
  );
  const [pendingReplyToMessageId, setPendingReplyToMessageId] = useState<string | null>(null);

  const pendingReplyTargetLabel = useMemo(
    () =>
      pendingReplyToMessageId
        ? getReplyTargetLabel(pendingReplyToMessageId, messageById, liveProfiles)
        : null,
    [messageById, pendingReplyToMessageId, liveProfiles],
  );

  const handlePickCommunityMedia = useCallback(async () => {
    if (isSending || isPickingCommunityMedia) return;
    setIsPickingCommunityMedia(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Allow Photos access to attach images or videos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
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
      setPendingCommunityMedia(payload);
    } catch (e) {
      Alert.alert("Could not add media", getErrorMessage(e, "Choose a different file."));
    } finally {
      setIsPickingCommunityMedia(false);
    }
  }, [isPickingCommunityMedia, isSending]);

  const handleSend = useCallback(async () => {
    const fromInput = composerInputRef.current
      ? await composerInputRef.current.getMarkdown()
      : draft;
    const text = fromInput.trim();
    if (!text && !pendingCommunityMedia) return;
    const replyToMessageId =
      pendingReplyToMessageId && messageById.has(pendingReplyToMessageId)
        ? pendingReplyToMessageId
        : undefined;
    const media = pendingCommunityMedia;
    try {
      setIsSending(true);
      await messaging.actions.sendMessage(text, {
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(media
          ? {
              mediaArrayBuffer: media.body,
              mediaContentType: media.contentType,
              mediaFilename: media.fileName,
            }
          : {}),
      });
      setDraft("");
      composerInputRef.current?.setValue("");
      setPendingCommunityMedia(null);
      setPendingReplyToMessageId(null);
    } catch (e) {
      Alert.alert("Send failed", getErrorMessage(e, "Could not send message."));
    } finally {
      setIsSending(false);
    }
  }, [draft, messageById, messaging.actions, pendingCommunityMedia, pendingReplyToMessageId]);

  const handleReplyToMessage = useCallback((messageId: string) => {
    setPendingReplyToMessageId(messageId);
    (composerInputRef.current as unknown as { focus?: () => void } | null)?.focus?.();
  }, []);

  const openMessageActions = useCallback((message: ChatMessage) => {
    setMessageActionsTarget({
      messageId: message.id,
      authorUserId: message.authorUserId ?? null,
      authorName: message.authorName ?? "Unknown",
    });
    setShowMessageActions(true);
  }, []);

  const handleKickFromMessageActions = useCallback(() => {
    if (!communityId || !messageActionsTarget?.authorUserId) return;
    const uid = messageActionsTarget.authorUserId;
    const name = messageActionsTarget.authorName;
    Alert.alert("Kick user", `Remove ${name} from this community?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Kick",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await getCommunityDataBackend(communityId).kickCommunityMember({
                communityId,
                targetUserId: uid,
              });
              Alert.alert("Done", "User was removed from the community.");
            } catch (e) {
              Alert.alert("Failed", getErrorMessage(e, "Could not kick user."));
            }
          })();
        },
      },
    ]);
  }, [communityId, messageActionsTarget]);

  const confirmBanUser = useCallback(
    async (reason: string) => {
      if (!communityId || !banTarget) return;
      await getCommunityDataBackend(communityId).banCommunityMember({
        communityId,
        targetUserId: banTarget.userId,
        reason,
      });
      Alert.alert("Banned", "User has been banned from this community.");
    },
    [banTarget, communityId],
  );

  const renderChatItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.kind === "divider") {
      return <MessageDateDivider label={item.label} />;
    }

    return (
      <CommunityMessageBubble
        {...item.message}
        attachments={item.message.attachments ?? []}
        isCondensed={item.isCondensed}
        onPress={() => composerInputRef.current?.blur()}
        onLongPress={() => openMessageActions(item.message)}
      />
    );
  }, [composerInputRef, openMessageActions]);

  const phase: "loading" | "ready" | "missing" | "error" =
    serversStatus === "loading" && servers.length === 0
      ? "loading"
      : serversStatus === "error"
        ? "error"
        : community
          ? "ready"
          : "missing";
  const phaseGate = <CommunityPhaseGate phase={phase} error={serversError} onRetry={refreshServers} />;
  if (phase !== "ready") return phaseGate;

  const authorUid = messageActionsTarget?.authorUserId ?? null;
  const canReportOthers =
    Boolean(authorUid) && authorUid !== currentUserId;
  const canKick =
    serverPermissions.canManageMembers &&
    Boolean(authorUid) &&
    authorUid !== currentUserId;
  const canBan =
    serverPermissions.canManageBans && Boolean(authorUid) && authorUid !== currentUserId;
  const canSendCommunityMessage =
    draft.trim().length > 0 || pendingCommunityMedia != null;

  // ─── Render ───────────────────────────────────────────────────────────────

return (
  <SafeAreaView
    edges={["bottom"]}
    className="flex-1 bg-background"
    style={{ flex: 1 }}
  >
    <CommunityChannelBar
      communityName={community?.name ?? "Community"}
      selectedChannelName={currentRenderableChannel?.name ?? "Select channel"}
      onPressCommunity={() => {
        if (canOpenServerSettings) setServerSettingsOpen(true);
      }}
      onPressSelectedChannel={() => setIsChannelDropdownOpen(true)}
    />

    <ChatInterface
      data={chatListItems}
      keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
      renderItem={renderChatItem}
      onEndReachedThreshold={0.3}
      onEndReached={() => {
        if (messaging.state.hasOlderMessages && !messaging.state.isLoadingOlderMessages) {
          void messaging.actions.requestOlderMessages();
        }
      }}
      ListEmptyComponent={
        <View className="items-center pt-8">
          <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
        </View>
      }
      ListFooterComponent={
        messaging.state.isLoadingOlderMessages ? (
          <View className="py-2.5">
            <ActivityIndicator color={composerColors.spinner} />
          </View>
        ) : null
      }
      composer={
        <ChatComposer
          inputRef={composerInputRef}
          colors={composerColors}
          isSending={isSending}
          isPickingMedia={isPickingCommunityMedia}
          canSend={canSendCommunityMessage}
          onChangeMarkdown={setDraft}
          onSend={() => void handleSend()}
          onPickMedia={() => void handlePickCommunityMedia()}
          strips={
            <>
              {pendingReplyToMessageId ? (
                <ChatReplyStrip
                  label={`Replying to ${pendingReplyTargetLabel ?? "a message"}`}
                  onCancel={() => setPendingReplyToMessageId(null)}
                />
              ) : null}
              {pendingCommunityMedia ? (
                <ChatMediaAttachmentStrip
                  fileName={pendingCommunityMedia.fileName}
                  iconColor={composerColors.iconMuted}
                  disabled={isSending}
                  onRemove={() => setPendingCommunityMedia(null)}
                />
              ) : null}
            </>
          }
        />
      }
    />

    <ChannelSwitcherModal
      visible={isChannelDropdownOpen}
      communityName={community?.name ?? "Community"}
      channels={channels}
      selectedChannelId={currentRenderableChannel?.id ?? null}
      onSelectTextChannel={(channelId) => {
        const ch = channels.find((c) => c.id === channelId);
        if (ch && ch.kind === "text") void handleSelectChannel(ch);
      }}
      onRequestClose={() => setIsChannelDropdownOpen(false)}
      onOpenChannelSettings={
        canOpenChannelSettings
          ? (channelId) => {
              const ch = channels.find((c) => c.id === channelId) ?? null;
              if (ch?.kind === "text") {
                setChannelSettingsChannel(ch);
                setIsChannelDropdownOpen(false);
              }
            }
          : undefined
      }
    />

    <MessageActionsSheet
      visible={showMessageActions}
      onClose={() => setShowMessageActions(false)}
      target={messageActionsTarget}
      communityName={community?.name ?? "Community"}
      canReport={canReportOthers}
      canKick={canKick}
      canBan={canBan}
      onReply={() => {
        if (messageActionsTarget) handleReplyToMessage(messageActionsTarget.messageId);
      }}
      onReport={() => {
        if (messageActionsTarget) setReportMessageId(messageActionsTarget.messageId);
      }}
      onKick={handleKickFromMessageActions}
      onBan={() => {
        if (messageActionsTarget?.authorUserId) {
          setBanTarget({
            userId: messageActionsTarget.authorUserId,
            username: messageActionsTarget.authorName,
          });
        }
      }}
    />

    <CommunityReportMessageModal
      visible={Boolean(reportMessageId)}
      onDismiss={() => setReportMessageId(null)}
      communityName={community?.name ?? "Community"}
      onSubmit={async (input) => {
        if (!reportMessageId) return;
        await messaging.actions.reportMessage({
          messageId: reportMessageId,
          ...input,
        });
      }}
    />

    <BanUserModal
      visible={Boolean(banTarget)}
      username={banTarget?.username ?? ""}
      onDismiss={() => setBanTarget(null)}
      onConfirm={confirmBanUser}
    />

    <MobileServerSettingsModal
      visible={serverSettingsOpen}
      onDismiss={() => setServerSettingsOpen(false)}
      communityId={communityId}
      communityName={community?.name ?? "Community"}
      currentUserId={currentUserId}
      canManageServer={serverPermissions.canManageServer}
      canManageRoles={serverPermissions.canManageRoles}
      canManageMembers={serverPermissions.canManageMembers}
      canManageBans={serverPermissions.canManageBans}
      canManageInvites={serverPermissions.canManageInvites}
      refreshServers={refreshServers}
    />

    <MobileChannelSettingsModal
      visible={Boolean(channelSettingsChannel)}
      onDismiss={() => setChannelSettingsChannel(null)}
      communityId={communityId}
      channel={channelSettingsChannel}
      currentUserId={currentUserId}
      canManageChannelStructure={serverPermissions.canManageChannelStructure}
      canManageChannelPermissions={serverPermissions.canManageChannelPermissions}
    />
  </SafeAreaView>
  
  );
};