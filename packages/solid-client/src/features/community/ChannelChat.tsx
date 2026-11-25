import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  untrack,
} from "solid-js";
import { requireHavenSolidCore } from "@solid-client/core";
import { usePeople } from "@solid-client/contexts/PeopleProvider";
import { useToast } from "@solid-client/contexts/ToastProvider";
import { ConfirmDialog } from "@solid-client/components/ui";
import {
  messageActions,
  outgoingMessages,
  windowMessages,
} from "@shared/collections/messages/selectors";
import { draftFor } from "@shared/collections/session/selectors";
import { memberColor } from "@shared/collections/roles/selectors";
import { isNewer } from "@shared/collections/kit/ids";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { buildMessageViewItems } from "@shared/features/messaging/messageViewModel";
import { MessageList } from "./messageList/MessageList";
import { Composer } from "./Composer";

/**
 * One channel's messages and its box: a community channel, or a conversation
 * (`communityId` null). The route has already opened the channel
 * (`core.openChannel` / `core.openConversation`), which loads its window;
 * this shows the window, pages it, reads it, and sends into it.
 */
export function ChannelChat(props: {
  channelId: string;
  communityId: string | null;
  placeholder: string;
}) {
  const core = requireHavenSolidCore();
  const people = usePeople();
  const toast = useToast();
  const messages = core.stores.messages;
  const me = () => core.userId ?? "";

  const window = () => messages.windows[props.channelId];
  const loaded = () => window() !== undefined;
  const loadStatus = () => messages.requests[`channel:${props.channelId}`];
  const shown = createMemo(() => windowMessages(messages, props.channelId));
  const sending = createMemo(() => outgoingMessages(messages, props.channelId));
  const can = (permission: Parameters<typeof core.communities.can>[1]) =>
    props.communityId !== null &&
    core.communities.can(props.communityId, permission);

  // Everyone and everything the window shows: authors, files, replies.
  createEffect(() => {
    const list = shown();
    const authors = list.map((m) => m.author_id);
    const files = list.flatMap((m) => m.attachments);
    const parents = list
      .map((m) => m.reply_to_id)
      .filter((id): id is string => id !== null && !messages.byId[id]);
    untrack(() => {
      void core.profiles.ensure(authors);
      void core.attachments.ensure(files).catch(() => {});
      if (parents.length > 0) void core.messages.ensure(parents);
    });
  });

  // Read up to the newest message once the window shows it.
  createEffect(() => {
    const at = window();
    const list = shown();
    const newest = list[list.length - 1]?.id;
    if (!at?.atNewest || !newest) return;
    const channelId = props.channelId;
    untrack(() => {
      const mark = core.stores.channels.mine[channelId]?.last_read_message_id;
      if (isNewer(newest, mark ?? null)) {
        void core.channels.markRead(channelId, newest).catch(() => {});
      }
    });
  });

  const items = createMemo(() =>
    buildMessageViewItems(shown(), sending(), {
      me: me(),
      nameOf: (userId) => core.nameOf(userId, props.communityId),
      colorOf: (userId) =>
        props.communityId
          ? memberColor(core.stores.roles, props.communityId, userId)
          : null,
      avatarOf: (userId) => core.avatarUrl(userId),
      isStaff: (userId) => core.stores.profiles.byId[userId]?.is_staff ?? false,
      messageOf: (id) => messages.byId[id],
      fileUrl: (file) => core.attachments.url(file.id),
      previewImageUrl: (path) => core.backend.media.previewImageUrl(path),
      actionsOf: (message) => messageActions(message, me(), can),
    }),
  );

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal<{
    messageId: string;
    preview: string;
  } | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const draft = () => draftFor(core.stores.session, props.channelId);
  const replyingTo = () => {
    const id = draft().reply_to_id;
    const parent = id ? messages.byId[id] : undefined;
    return parent
      ? {
          name: core.nameOf(parent.author_id, props.communityId),
          preview: parent.body.slice(0, 80),
        }
      : null;
  };

  const fail = (title: string) => (error: unknown) =>
    toast.show({
      title,
      body: getErrorMessage(error, "Try again in a moment."),
    });

  const confirmDelete = async () => {
    const target = pendingDelete();
    if (!target || deleting()) return;
    setDeleting(true);
    try {
      await core.messages.remove(target.messageId);
    } catch (error) {
      fail("Couldn't delete message")(error);
    } finally {
      setPendingDelete(null);
      setDeleting(false);
    }
  };

  /** An image goes up first; the message then shows at once as it is sent. */
  const send = async (body: string, image?: File) => {
    const attachment_ids: string[] = [];
    if (image) {
      const uploaded = await core.backend.media.uploadFile("attachment", {
        body: image,
        mime_type: image.type,
        size_bytes: image.size,
        filename: image.name,
      });
      attachment_ids.push(uploaded.id);
    }
    const reply_to_id = draft().reply_to_id ?? undefined;
    // A refused send stays in the list with its error and a retry.
    void core
      .send(props.channelId, {
        body,
        reply_to_id,
        attachment_ids: attachment_ids.length > 0 ? attachment_ids : undefined,
      })
      .catch(() => {});
  };

  const onReachTop = () => {
    const at = window();
    if (at && !at.atOldest) void core.messages.loadOlder(props.channelId);
  };
  const onReachBottom = () => {
    const at = window();
    if (at && !at.atNewest) void core.messages.loadNewer(props.channelId);
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="min-h-0 flex-1">
        <Show
          when={loaded()}
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              {loadStatus()?.error
                ? getErrorMessage(
                    loadStatus()!.error,
                    "Couldn't load messages.",
                  )
                : "Loading…"}
            </div>
          }
        >
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center text-muted-foreground">
                No messages yet — say something.
              </div>
            }
          >
            <MessageList
              items={items()}
              onReachTop={onReachTop}
              onReachBottom={onReachBottom}
              editingMessageId={editingId()}
              onReply={(messageId) =>
                core.session.setDraft(props.channelId, {
                  body: draft().body,
                  reply_to_id: messageId,
                })
              }
              onReact={(messageId, emoji, on) =>
                void core.messages
                  .react(messageId, emoji, on)
                  .catch(fail("Couldn't react"))
              }
              onEditMessage={setEditingId}
              onSaveEdit={async (messageId, body) => {
                await core.messages.edit(messageId, body);
                setEditingId(null);
              }}
              onCancelEdit={() => setEditingId(null)}
              onDeleteMessage={(messageId, preview) =>
                setPendingDelete({ messageId, preview })
              }
              onReportMessage={(messageId, preview) =>
                people.report({
                  subject: "message",
                  messageId,
                  communityId: props.communityId,
                  preview,
                })
              }
              onReportUser={(userId, name) =>
                people.report({
                  subject: "person",
                  userId,
                  communityId: props.communityId,
                  name,
                })
              }
              onOpenProfile={(userId) =>
                people.openProfile(userId, props.communityId)
              }
              onRetry={(nonce) =>
                void core.messages.retry(nonce).catch(() => {})
              }
              onDiscard={(nonce) => core.messages.discard(nonce)}
            />
          </Show>
        </Show>
      </div>
      <Show
        when={props.communityId === null || can("send_messages")}
        fallback={
          <p class="shrink-0 px-4 pb-4 pt-1 text-sm text-muted-foreground">
            You can't send messages in this channel.
          </p>
        }
      >
        <Composer
          placeholder={props.placeholder}
          body={draft().body}
          onInput={(body) =>
            core.session.setDraft(props.channelId, {
              body,
              reply_to_id: draft().reply_to_id,
            })
          }
          replyingTo={replyingTo()}
          onCancelReply={() =>
            core.session.setDraft(props.channelId, {
              body: draft().body,
              reply_to_id: null,
            })
          }
          onSend={send}
        />
      </Show>
      <ConfirmDialog
        open={pendingDelete() !== null}
        title="Delete message?"
        description={`“${pendingDelete()?.preview ?? ""}” will be removed for everyone. This can't be undone.`}
        confirmLabel="Delete"
        danger
        pending={deleting()}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
