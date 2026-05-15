import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import { useAuthStore } from "@shared/stores/authStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useCurrentServerPermissionUi } from "@shared/features/community/hooks/useCurrentServerPermissionUi";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useMessagesStore } from "@shared/stores/messagesStore";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useServers } from "@shared/features/community/hooks/useServers";
import { getCommunityDataBackend } from "@shared/lib/backend";
import type { Channel } from "@shared/lib/backend/types";
import { getErrorMessage } from "@platform/lib/errors";
import {
  buildChatListItemsFromChatMessages,
  buildMessageBundleById,
  getReplyTargetLabel,
  mapBundlesToChatMessages,
} from "@/features/community/communityChannelChatFromBundles";
import { ChatScrollView } from "@/features/community/ChatScrollView";
import {
  CommunityMessageBubble,
  MessageDateDivider,
  type ChatListItem,
  type ChatMessage,
} from "@/features/community/CommunityMessageBubble";
import {
  MessageActionsSheet,
  type MessageActionTarget,
} from "@/features/community/MessageActionsSheet";
import { CommunityReportMessageModal } from "@/features/community/CommunityReportMessageModal";
import { BanUserModal } from "@/features/community/BanUserModal";
import { MobileChannelSettingsModal } from "@/features/community/settings/MobileChannelSettingsModal";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "@/features/community/loadPickedCommunityMediaForUpload";
import { Spinner } from "@/components/ui/spinner";
import { ThemedIonicons, useComposerRnemCssVariables } from "@/theme-rn";

const MARGIN = 8;
const COMPOSER_CHROME_IMMERSIVE_OPACITY = 0.38;
const COMPOSER_CHROME_REST_OPACITY = 1;
const COMPOSER_CHROME_IMMERSIVE_MS = 140;
const COMPOSER_CHROME_REST_MS = 280;
const COMPOSER_CHROME_SETTLE_MS = 200;

export function Rev2ChannelThreadScreen() {
  const navigation = useNavigation();
  const rnemColors = useComposerRnemCssVariables();
  const { bottom } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const adjustedBlankSpace = useDerivedValue(() => composerHeight.value - bottom);
  const composerChromeOpacity = useSharedValue(COMPOSER_CHROME_REST_OPACITY);
  const listDragRef = useRef(false);
  const listMomentumRef = useRef(false);
  const composerSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composerInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);

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

  const communityId = useNavigationStore((state) => state.currentServerId) ?? null;
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id ?? null;

  const { serverPermissions } = useCurrentServerPermissionUi(communityId);
  const canOpenChannelSettings =
    serverPermissions.canManageChannelStructure || serverPermissions.canManageChannelPermissions;

  const { servers } = useServers();
  const {
    state: { channels, channelsLoading },
    derived: { currentRenderableChannel },
  } = useCommunityWorkspace({ servers, currentUserId, autoSelectFirstServer: false });

  const messaging = useMessages({
    currentServerId: communityId,
    currentChannelId: currentRenderableChannel?.id ?? null,
    currentUserId,
    isCurrentUserElevatedInServer: false,
    debugChannelReloads: false,
    channels,
  });

  const storedMessages = useMessagesStore((state) => state.messages);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);

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

  const [messageActionsTarget, setMessageActionsTarget] = useState<MessageActionTarget | null>(null);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; username: string } | null>(null);
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentRenderableChannel ? `#${currentRenderableChannel.name}` : "Channel",
      headerRight:
        currentRenderableChannel && canOpenChannelSettings
          ? () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Channel settings"
                hitSlop={10}
                onPress={() => setChannelSettingsChannel(currentRenderableChannel)}
                className="mr-2 p-1 active:opacity-70"
              >
                <ThemedIonicons name="options-outline" size={22} colorClassName="accent-foreground" />
              </Pressable>
            )
          : undefined,
    });
  }, [canOpenChannelSettings, currentRenderableChannel, navigation]);

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

  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <ChatScrollView
        {...props}
        blankSpace={adjustedBlankSpace}
        keyboardLiftBehavior="whenAtEnd"
      />
    ),
    [adjustedBlankSpace],
  );

  const renderChatItem = useCallback(
    ({ item }: { item: ChatListItem }) => {
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
    },
    [composerInputRef, openMessageActions],
  );

  const authorUid = messageActionsTarget?.authorUserId ?? null;
  const canReportOthers = Boolean(authorUid) && authorUid !== currentUserId;
  const canKick =
    serverPermissions.canManageMembers && Boolean(authorUid) && authorUid !== currentUserId;
  const canBan =
    serverPermissions.canManageBans && Boolean(authorUid) && authorUid !== currentUserId;
  const canSendCommunityMessage = draft.trim().length > 0 || pendingCommunityMedia != null;

  if (!currentRenderableChannel?.id) {
    return (
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-background" style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-center text-muted-foreground">Pick a channel from the list first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-background" style={{ flex: 1 }}>
      <FlatList
        className="flex-1"
        data={chatListItems}
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
        contentContainerStyle={{ paddingTop: 32 }}
        keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
        renderItem={renderChatItem}
        renderScrollComponent={renderScrollComponent}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (messaging.state.hasOlderMessages && !messaging.state.isLoadingOlderMessages) {
            void messaging.actions.requestOlderMessages();
          }
        }}
        ListEmptyComponent={
          channelsLoading && chatListItems.length === 0 ? (
            <View className="items-center pt-8">
              <Spinner size="small" colorClassName="accent-foreground" />
            </View>
          ) : (
            <View className="items-center pt-8">
              <Text className="text-muted-foreground text-[13px]">No messages yet.</Text>
            </View>
          )
        }
        ListFooterComponent={
          messaging.state.isLoadingOlderMessages ? (
            <View className="py-2.5">
              <Spinner colorClassName="accent-foreground" />
            </View>
          ) : null
        }
      />

      <KeyboardStickyView
        offset={{ opened: bottom - MARGIN }}
        onLayout={(e) => {
          composerHeight.value = e.nativeEvent.layout.height;
        }}
        style={{
          position: "absolute",
          width: "100%",
          bottom: bottom - MARGIN,
        }}
      >
        {pendingReplyToMessageId ? (
          <View className="flex-row items-center justify-between border-t border-border bg-surface-modal px-3 py-2">
            <Text className="mr-2.5 shrink text-xs text-foreground/80">
              Replying to {pendingReplyTargetLabel ?? "a message"}
            </Text>
            <Pressable hitSlop={8} onPress={() => setPendingReplyToMessageId(null)}>
              <Text className="text-xs font-semibold text-primary">Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {pendingCommunityMedia ? (
          <View className="flex-row items-center gap-2 border-t border-border bg-surface-modal/90 px-3 py-2">
            <ThemedIonicons name="attach" size={16} colorClassName="accent-text-dim" />
            <Text className="min-w-0 flex-1 text-xs text-foreground/90" numberOfLines={1}>
              {pendingCommunityMedia.fileName}
            </Text>
            <Pressable
              hitSlop={8}
              disabled={isSending}
              onPress={() => setPendingCommunityMedia(null)}
              className="shrink-0"
            >
              <Text className="text-xs font-semibold text-primary">Remove</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="flex-row items-end gap-2 bg-transparent px-3 pb-3 pt-2.5">
          <Animated.View style={composerChromeAnimatedStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add media"
              disabled={isSending || isPickingCommunityMedia}
              onPress={() => void handlePickCommunityMedia()}
              className="mb-0.5 h-[34px] w-[34px] items-center justify-center rounded-full bg-muted disabled:opacity-50"
            >
              <ThemedIonicons name="add" size={20} colorClassName="accent-primary-foreground" />
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[{ flex: 1, flexDirection: "row", alignItems: "flex-end" }, composerChromeAnimatedStyle]}
          >
            <View className="flex-1 flex-row items-center rounded-[18px] border border-border bg-muted/40 pr-1">
              <EnrichedMarkdownTextInput
                ref={composerInputRef}
                multiline
                editable={!isSending}
                scrollEnabled
                defaultValue=""
                onChangeMarkdown={setDraft}
                placeholder="Type a message..."
                placeholderTextColor={rnemColors.textDim}
                cursorColor={rnemColors.foreground}
                selectionColor={rnemColors.selection}
                markdownStyle={{
                  strong: { color: rnemColors.foreground },
                  em: { color: rnemColors.foreground },
                  link: { color: rnemColors.primary, underline: true },
                  spoiler: {
                    color: rnemColors.textMuted,
                    backgroundColor: rnemColors.spoilerBackground,
                  },
                }}
                style={{
                  flex: 1,
                  minHeight: 36,
                  maxHeight: 120,
                  color: rnemColors.foreground,
                  paddingHorizontal: 14,
                  paddingTop: 8,
                  paddingBottom: 8,
                  fontSize: 16,
                  backgroundColor: "transparent",
                }}
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={isSending || !canSendCommunityMessage}
                style={{
                  opacity: canSendCommunityMessage ? (isSending ? 0.55 : 1) : 0,
                  pointerEvents: canSendCommunityMessage ? "auto" : "none",
                }}
                className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary"
              >
                <ThemedIonicons name="arrow-up" size={18} colorClassName="accent-primary-foreground" />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardStickyView>

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
}
