import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import type { EnrichedMarkdownTextInputInstance } from "react-native-enriched-markdown";
import {
  messageActions,
  outgoingMessages,
  windowMessages,
} from "@shared/collections/messages/selectors";
import { draftFor } from "@shared/collections/session/selectors";
import { memberColor } from "@shared/collections/roles/selectors";
import { isNewer } from "@shared/collections/kit/ids";
import type { Permission } from "@shared/lib/backend/records";
import {
  buildMessageViewItems,
  type MessageRowItem,
  type MessageViewItem,
} from "@shared/features/messaging/messageViewModel";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { useHavenCore, useMe, useStore } from "@mobile-data";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ChatMediaAttachmentStrip } from "@/components/chat/ChatMediaAttachmentStrip";
import { ChatReplyStrip } from "@/components/chat/ChatReplyStrip";
import { useChatComposerColors } from "@/components/chat/useChatComposerColors";
import { usePeople } from "@/features/people/PeopleProvider";
import {
  CommunityMessageBubble,
  MessageDateDivider,
} from "./CommunityMessageBubble";
import {
  MessageActionsSheet,
  type MessageActionTarget,
} from "./MessageActionsSheet";
import {
  loadPickedCommunityMediaForUpload,
  type CommunityMediaUploadPayload,
} from "./loadPickedCommunityMediaForUpload";

/**
 * One channel's messages and its box: a community channel, or a conversation
 * (`communityId` null). The screen has already opened the channel
 * (`core.openChannel` / `core.openConversation`), which loads its window;
 * this shows the window, pages it, reads it, and sends into it.
 *
 * The box's text and the message being replied to are the session's draft
 * (`core.session.setDraft`), so they survive leaving the channel.
 */
export function ChannelChat({
  channelId,
  communityId,
  drawerGestureNonce = 0,
}: {
  channelId: string;
  communityId: string | null;
  /** Bumped when the drawer is dragged, to put the keyboard away. */
  drawerGestureNonce?: number;
}) {
  const core = useHavenCore();
  const people = usePeople();
  const me = useMe() ?? "";
  const composerColors = useChatComposerColors();
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);

  const window = useStore("messages", (s) => s.windows[channelId] ?? null);
  const loadError = useStore(
    "messages",
    (s) => s.requests[`channel:${channelId}`]?.error ?? null,
  );
  const olderRunning = useStore(
    "messages",
    (s) => s.requests[`older:${channelId}`]?.running ?? false,
  );
  const shown = useStore("messages", (s) => windowMessages(s, channelId));
  const sending = useStore("messages", (s) => outgoingMessages(s, channelId));
  const heldById = useStore("messages", (s) => s.byId);
  const profiles = useStore("profiles", (s) => s.byId);
  const members = useStore("members", (s) => s);
  const roles = useStore("roles", (s) => s);
  const attachments = useStore("attachments", (s) => s);
  const permissions = useStore("communities", (s) =>
    communityId ? (s.permissions[communityId] ?? null) : null,
  );
  const draft = useStore("session", (s) => draftFor(s, channelId));

  const can = useCallback(
    (permission: Permission) =>
      communityId !== null && (permissions?.includes(permission) ?? false),
    [communityId, permissions],
  );

  // Everyone and everything the window shows: authors, files, replies.
  useEffect(() => {
    const authors = shown.map((m) => m.author_id);
    const files = shown.flatMap((m) => m.attachments);
    const held = core.stores.messages.getState().byId;
    const parents = shown
      .map((m) => m.reply_to_id)
      .filter((id): id is string => id !== null && !held[id]);
    void core.profiles.ensure(authors);
    void core.attachments.ensure(files).catch(() => {});
    if (parents.length > 0) void core.messages.ensure(parents);
  }, [core, shown]);

  // Read up to the newest message once the window shows it.
  const newestId = shown[shown.length - 1]?.id ?? null;
  useEffect(() => {
    if (!window?.atNewest || !newestId) return;
    const mark =
      core.stores.channels.getState().mine[channelId]?.last_read_message_id;
    if (isNewer(newestId, mark ?? null)) {
      void core.channels.markRead(channelId, newestId).catch(() => {});
    }
  }, [channelId, core, newestId, window?.atNewest]);

  const items = useMemo(
    () =>
      // Newest first: the list is inverted, so data[0] is at the bottom.
      buildMessageViewItems(shown, sending, {
        me,
        nameOf: (userId) => core.nameOf(userId, communityId),
        colorOf: (userId) =>
          communityId ? memberColor(roles, communityId, userId) : null,
        avatarOf: (userId) => core.avatarUrl(userId),
        isStaff: (userId) => profiles[userId]?.is_staff ?? false,
        messageOf: (id) => heldById[id],
        fileUrl: (file) => core.attachments.url(file.id),
        previewImageUrl: (path) => core.backend.media.previewImageUrl(path),
        actionsOf: (message) => messageActions(message, me, can),
      }).reverse(),
    // members and attachments are read through core.nameOf / core.attachments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      attachments,
      can,
      communityId,
      core,
      heldById,
      me,
      members,
      profiles,
      roles,
      sending,
      shown,
    ],
  );

  // The box starts with the channel's draft, and follows it when it is
  // emptied from elsewhere (sending, a sign-out).
  const typed = useRef(draft.body);
  useEffect(() => {
    if (draft.body === typed.current) return;
    typed.current = draft.body;
    inputRef.current?.setValue(draft.body);
  }, [draft.body]);
  useEffect(() => {
    typed.current = draft.body;
    inputRef.current?.setValue(draft.body);
    setEditingId(null);
    setPendingMedia(null);
    // Only on a channel change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (drawerGestureNonce <= 0) return;
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, [drawerGestureNonce]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionsTarget, setActionsTarget] = useState<MessageRowItem | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pendingMedia, setPendingMedia] =
    useState<CommunityMediaUploadPayload | null>(null);
  const [boxText, setBoxText] = useState(draft.body);

  const setBody = (body: string) => {
    setBoxText(body);
    if (editingId) return;
    typed.current = body;
    core.session.setDraft(channelId, {
      body,
      reply_to_id:
        core.stores.session.getState().drafts[channelId]?.reply_to_id ?? null,
    });
  };

  const replyParent = draft.reply_to_id
    ? heldById[draft.reply_to_id]
    : undefined;

  const pickMedia = async () => {
    if (busy || picking) return;
    setPicking(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Allow Photos access to attach images or videos.",
        );
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
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode
                  .Compatible,
            }
          : {}),
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) return;
      setPendingMedia(await loadPickedCommunityMediaForUpload(asset));
    } catch (e) {
      Alert.alert(
        "Could not add media",
        getErrorMessage(e, "Choose a different file."),
      );
    } finally {
      setPicking(false);
    }
  };

  /** A file goes up first; the message then shows at once as it is sent. */
  const send = async () => {
    const text = (
      inputRef.current ? await inputRef.current.getMarkdown() : boxText
    ).trim();
    if (editingId) {
      if (!text) return;
      setBusy(true);
      try {
        await core.messages.edit(editingId, text);
        setEditingId(null);
        inputRef.current?.setValue(draft.body);
      } catch (e) {
        Alert.alert("Edit failed", getErrorMessage(e, "Could not save edit."));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!text && !pendingMedia) return;
    setBusy(true);
    try {
      const attachment_ids: string[] = [];
      if (pendingMedia) {
        const uploaded = await core.backend.media.uploadFile("attachment", {
          body: pendingMedia.body,
          mime_type: pendingMedia.contentType,
          size_bytes: pendingMedia.body.byteLength,
          filename: pendingMedia.fileName,
        });
        attachment_ids.push(uploaded.id);
      }
      const reply_to_id = draft.reply_to_id ?? undefined;
      setPendingMedia(null);
      // A refused send stays in the list with its error and a retry.
      void core
        .send(channelId, {
          body: text,
          reply_to_id,
          attachment_ids:
            attachment_ids.length > 0 ? attachment_ids : undefined,
        })
        .catch(() => {});
    } catch (e) {
      Alert.alert("Send failed", getErrorMessage(e, "Could not send message."));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (item: MessageRowItem) => {
    setPendingMedia(null);
    setEditingId(item.id);
    inputRef.current?.setValue(item.body);
    inputRef.current?.focus();
  };

  const cancelEditing = () => {
    setEditingId(null);
    inputRef.current?.setValue(draft.body);
  };

  const confirmDelete = (item: MessageRowItem) =>
    Alert.alert(
      "Delete message?",
      "It will be removed for everyone. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (editingId === item.id) cancelEditing();
            core.messages
              .remove(item.id)
              .catch((e: unknown) =>
                Alert.alert(
                  "Couldn't delete message",
                  getErrorMessage(e, "Try again in a moment."),
                ),
              );
          },
        },
      ],
    );

  const renderItem = ({ item }: { item: MessageViewItem }) => {
    if (item.kind === "date-divider") {
      return <MessageDateDivider label={item.label} />;
    }
    return (
      <CommunityMessageBubble
        item={item}
        onPress={() => inputRef.current?.blur()}
        onLongPress={
          item.outgoing
            ? undefined
            : () => {
                inputRef.current?.blur();
                setActionsTarget(item);
              }
        }
        onPressAuthor={() => {
          inputRef.current?.blur();
          people.openProfile(item.authorId, communityId);
        }}
        onToggleReaction={(emoji, on) =>
          void core.messages
            .react(item.id, emoji, on)
            .catch((e: unknown) =>
              Alert.alert("Couldn't react", getErrorMessage(e, "Try again.")),
            )
        }
        onRetry={
          item.outgoing
            ? () =>
                void core.messages.retry(item.outgoing!.nonce).catch(() => {})
            : undefined
        }
        onDiscard={
          item.outgoing
            ? () => core.messages.discard(item.outgoing!.nonce)
            : undefined
        }
      />
    );
  };

  const canSend = communityId === null || can("send_messages");
  const target: MessageActionTarget | null = actionsTarget
    ? {
        messageId: actionsTarget.id,
        authorUserId: actionsTarget.authorId,
        authorName: actionsTarget.authorName,
      }
    : null;
  const communityName = useStore("communities", (s) =>
    communityId ? (s.byId[communityId]?.name ?? "Community") : "Conversation",
  );

  const listPlaceholder = !window ? (
    <View className="flex-1 items-center justify-center pt-8">
      {loadError ? (
        <Text className="text-[13px] text-muted-foreground">
          {getErrorMessage(loadError, "Couldn't load messages.")}
        </Text>
      ) : (
        <ActivityIndicator color={composerColors.spinner} />
      )}
    </View>
  ) : undefined;

  return (
    <View className="flex-1 bg-background" style={{ flex: 1 }}>
      <Animated.View
        key={channelId}
        entering={FadeIn.duration(150)}
        className="flex-1"
        style={{ flex: 1 }}
      >
        <ChatInterface
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          listPlaceholder={listPlaceholder}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (window && !window.atOldest && !olderRunning) {
              void core.messages.loadOlder(channelId);
            }
          }}
          onStartReached={() => {
            if (window && !window.atNewest) {
              void core.messages.loadNewer(channelId);
            }
          }}
          ListEmptyComponent={
            <View className="min-h-30 items-center justify-center pt-8">
              <Text className="text-[13px] text-muted-foreground">
                No messages yet. Say something.
              </Text>
            </View>
          }
          ListFooterComponent={
            olderRunning ? (
              <View className="py-2.5">
                <ActivityIndicator color={composerColors.spinner} />
              </View>
            ) : undefined
          }
          composer={
            canSend ? (
              <ChatComposer
                inputRef={inputRef}
                colors={composerColors}
                isSending={busy}
                isPickingMedia={picking}
                canSend={boxText.trim().length > 0 || pendingMedia != null}
                onChangeMarkdown={setBody}
                onSend={() => void send()}
                onPickMedia={() => {
                  if (!editingId) void pickMedia();
                }}
                strips={
                  <>
                    {editingId ? (
                      <ChatReplyStrip
                        label="Editing message"
                        onCancel={cancelEditing}
                      />
                    ) : null}
                    {draft.reply_to_id && !editingId ? (
                      <ChatReplyStrip
                        label={`Replying to ${
                          replyParent
                            ? core.nameOf(replyParent.author_id, communityId)
                            : "a message"
                        }`}
                        onCancel={() =>
                          core.session.setDraft(channelId, {
                            body: draft.body,
                            reply_to_id: null,
                          })
                        }
                      />
                    ) : null}
                    {pendingMedia ? (
                      <ChatMediaAttachmentStrip
                        fileName={pendingMedia.fileName}
                        disabled={busy}
                        onRemove={() => setPendingMedia(null)}
                      />
                    ) : null}
                  </>
                }
              />
            ) : (
              <Text className="px-4 pb-4 pt-1 text-sm text-muted-foreground">
                You can't send messages in this channel.
              </Text>
            )
          }
        />
      </Animated.View>
      <MessageActionsSheet
        visible={target !== null}
        onClose={() => setActionsTarget(null)}
        target={target}
        communityName={communityName}
        canReply={actionsTarget?.actions.reply ?? false}
        canCopy={(actionsTarget?.body.trim().length ?? 0) > 0}
        canEdit={actionsTarget?.actions.edit ?? false}
        canDelete={actionsTarget?.actions.delete ?? false}
        canReport={actionsTarget?.actions.report ?? false}
        quickReactions={QUICK_REACTIONS}
        onReact={(emoji) => {
          const item = actionsTarget;
          if (!item) return;
          const mine = item.reactions.some((r) => r.emoji === emoji && r.mine);
          void core.messages.react(item.id, emoji, !mine).catch(() => {});
        }}
        onReply={() => {
          const item = actionsTarget;
          if (!item) return;
          if (editingId) cancelEditing();
          core.session.setDraft(channelId, {
            body: draft.body,
            reply_to_id: item.id,
          });
        }}
        onCopy={() => {
          if (actionsTarget) void Clipboard.setStringAsync(actionsTarget.body);
        }}
        onEdit={() => {
          if (actionsTarget) startEditing(actionsTarget);
        }}
        onDelete={() => {
          if (actionsTarget) confirmDelete(actionsTarget);
        }}
        onReport={() => {
          const item = actionsTarget;
          if (!item) return;
          people.report({
            subject: "message",
            messageId: item.id,
            communityId,
            preview: item.body.slice(0, 200),
          });
        }}
      />
    </View>
  );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
