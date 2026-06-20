import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import {
  BellOff,
  Flag,
  ImageIcon,
  ImagePlus,
  MessageCirclePlus,
  SendHorizontal,
  X,
} from "lucide-solid";
import { normalizeCommunityMarkdown } from "@shared/features/messaging/utils/communityMarkdownParity";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/lib/liveProfiles";
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
  FriendSummary,
} from "@shared/lib/backend/types";
import { getErrorMessage } from "@shared/infrastructure/platform/lib/errors";
import { requireHavenSolidCore } from "@solid-client/core";
import { useSession } from "@solid-client/contexts/SessionProvider";
import {
  createDmConversations,
  createDmConversationsLoading,
  createDmMessages,
  createDmMessagesLoading,
} from "@solid-client/data/direct-messages";
import {
  createSocialFriends,
  createSocialLoading,
} from "@solid-client/data/social";
import { Avatar, Button, Markdown, Tooltip } from "@solid-client/components/ui";

type DmSendOptions = {
  imageUpload?: {
    body: Blob;
    filename?: string;
    expiresInHours?: number;
  };
  optimisticAttachmentUri?: string | null;
};

type DmReportTarget = {
  message: DirectMessage;
  authorName: string;
};

const DM_REPORT_KIND_OPTIONS: {
  value: DirectMessageReportKind;
  label: string;
}[] = [
  { value: "content_abuse", label: "Content abuse" },
  { value: "bug", label: "Bug / platform issue" },
];

export function DirectMessagesView() {
  const core = requireHavenSolidCore();
  const params = useParams();
  const navigate = useNavigate();
  const conversations = createDmConversations(core.directMessages);
  const loadingConversations = createDmConversationsLoading(
    core.directMessages,
  );
  const friends = createSocialFriends(core.social);
  const loadingSocial = createSocialLoading(core.social);
  const liveProfiles = core.profiles.liveProfiles();
  const [openError, setOpenError] = createSignal<string | null>(null);
  const [friendPickerOpen, setFriendPickerOpen] = createSignal(false);
  const [friendOpenError, setFriendOpenError] = createSignal<string | null>(
    null,
  );
  const [openingFriendId, setOpeningFriendId] = createSignal<string | null>(
    null,
  );

  const activeConversation = createMemo(() =>
    conversations().find((c) => c.conversationId === params.conversationId),
  );

  createEffect(() => {
    const id = params.conversationId ?? null;
    setOpenError(null);
    if (!id) {
      core.directMessages.clearFocusedConversation();
      return;
    }
    void core.directMessages
      .openConversation(id, { markRead: true })
      .catch((error) => {
        setOpenError(getErrorMessage(error, "Failed to open conversation."));
      });
  });

  createEffect(() => {
    if (!friendPickerOpen()) return;
    setFriendOpenError(null);
    void core.social.ensureLoaded({ freshnessMs: 0 }).catch((error) => {
      setFriendOpenError(getErrorMessage(error, "Failed to load friends."));
    });
  });

  const startConversation = async (friend: FriendSummary) => {
    if (openingFriendId()) return;
    setOpeningFriendId(friend.friendUserId);
    setFriendOpenError(null);
    try {
      const conversationId = await core.directMessages.openWithUser(
        friend.friendUserId,
      );
      setFriendPickerOpen(false);
      navigate(`/direct-messages/${conversationId}`);
    } catch (error) {
      setFriendOpenError(
        getErrorMessage(error, "Failed to start direct message."),
      );
    } finally {
      setOpeningFriendId(null);
    }
  };

  const peerLabel = (conversation: DirectMessageConversationSummary): string =>
    resolveLiveUsername(
      liveProfiles(),
      conversation.otherUserId,
      conversation.otherUsername,
    )?.trim() || "Direct";

  return (
    <div class="flex h-full min-w-0 flex-1 bg-surface-app">
      <aside class="flex w-72 shrink-0 flex-col border-r border-border bg-surface-panel">
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h1 class="text-sm font-semibold text-foreground">Direct Messages</h1>
          <div class="flex items-center gap-1.5">
            <Show when={loadingConversations()}>
              <span class="text-xs text-muted-foreground">Loading...</span>
            </Show>
            <Button
              size="icon"
              variant="ghost"
              class="h-8 w-8"
              aria-label="New direct message"
              onClick={() => setFriendPickerOpen(true)}
            >
              <MessageCirclePlus size={16} />
            </Button>
          </div>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <Show
            when={!friendPickerOpen()}
            fallback={
              <FriendPicker
                friends={friends()}
                loading={loadingSocial()}
                error={friendOpenError()}
                openingFriendId={openingFriendId()}
                onClose={() => setFriendPickerOpen(false)}
                onSelect={(friend) => void startConversation(friend)}
              />
            }
          >
            <Show
              when={conversations().length > 0}
              fallback={
                <div class="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
                  No conversations yet.
                </div>
              }
            >
              <For each={conversations()}>
                {(conversation) => (
                  <ConversationRow
                    conversation={conversation}
                    label={peerLabel(conversation)}
                    avatarUrl={resolveLiveAvatarUrl(
                      liveProfiles(),
                      conversation.otherUserId,
                      conversation.otherAvatarUrl,
                    )}
                    active={
                      conversation.conversationId === params.conversationId
                    }
                    onClick={() =>
                      navigate(
                        `/direct-messages/${conversation.conversationId}`,
                      )
                    }
                  />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <Show
          when={params.conversationId}
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              Select a conversation.
            </div>
          }
        >
          <Show
            when={!openError()}
            fallback={
              <div class="flex h-full items-center justify-center px-6 text-center text-sm text-send-error">
                {openError()}
              </div>
            }
          >
            <DmConversation
              conversationId={params.conversationId ?? ""}
              conversation={activeConversation()}
              title={
                activeConversation()
                  ? peerLabel(activeConversation()!)
                  : "Direct"
              }
            />
          </Show>
        </Show>
      </main>
    </div>
  );
}

function FriendPicker(props: {
  friends: FriendSummary[];
  loading: boolean;
  error: string | null;
  openingFriendId: string | null;
  onClose: () => void;
  onSelect: (friend: FriendSummary) => void;
}) {
  return (
    <div class="flex h-full flex-col">
      <div class="mb-2 flex items-center gap-2 px-2">
        <span class="min-w-0 flex-1 text-xs font-semibold uppercase text-muted-foreground">
          New message
        </span>
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7"
          aria-label="Close new direct message"
          onClick={props.onClose}
        >
          <X size={15} />
        </Button>
      </div>
      <Show when={props.error}>
        <p class="mb-2 px-2 text-xs text-send-error">{props.error}</p>
      </Show>
      <Show
        when={!props.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        }
      >
        <Show
          when={props.friends.length > 0}
          fallback={
            <div class="flex flex-1 items-center justify-center px-5 text-center text-sm text-muted-foreground">
              No friends available.
            </div>
          }
        >
          <For each={props.friends}>
            {(friend) => (
              <button
                class="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-surface-list-hover disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  props.openingFriendId !== null &&
                  props.openingFriendId !== friend.friendUserId
                }
                onClick={() => props.onSelect(friend)}
              >
                <Avatar
                  src={friend.avatarUrl}
                  name={friend.username}
                  size="lg"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-foreground">
                    {friend.username}
                  </p>
                  <p class="truncate text-xs text-muted-foreground">
                    {friend.mutualCommunityCount > 0
                      ? `${friend.mutualCommunityCount} mutual ${
                          friend.mutualCommunityCount === 1
                            ? "server"
                            : "servers"
                        }`
                      : "Friend"}
                  </p>
                </div>
                <Show when={props.openingFriendId === friend.friendUserId}>
                  <span class="text-xs text-muted-foreground">Opening...</span>
                </Show>
              </button>
            )}
          </For>
        </Show>
      </Show>
    </div>
  );
}
function ConversationRow(props: {
  conversation: DirectMessageConversationSummary;
  label: string;
  avatarUrl: string | null;
  active: boolean;
  onClick: () => void;
}) {
  const unread = () => props.conversation.unreadCount > 0;

  return (
    <button
      onClick={props.onClick}
      class="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-surface-list-hover"
      classList={{ "bg-surface-row-selected": props.active }}
    >
      <Avatar src={props.avatarUrl} name={props.label} size="lg" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span
            class="min-w-0 truncate text-sm text-foreground"
            classList={{ "font-semibold": unread() }}
          >
            {props.label}
          </span>
          <Show when={props.conversation.isMuted}>
            <BellOff size={12} class="shrink-0 text-muted-foreground" />
          </Show>
        </div>
        <p class="truncate text-xs text-muted-foreground">
          {props.conversation.lastMessagePreview ?? "No messages yet"}
        </p>
      </div>
      <Show when={unread()}>
        <span class="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-bold text-primary-foreground">
          {props.conversation.unreadCount > 99
            ? "99+"
            : props.conversation.unreadCount}
        </span>
      </Show>
    </button>
  );
}

function DmConversation(props: {
  conversationId: string;
  conversation?: DirectMessageConversationSummary;
  title: string;
}) {
  const core = requireHavenSolidCore();
  const { session } = useSession();
  const liveProfiles = core.profiles.liveProfiles();
  const messages = createDmMessages(
    core.directMessages,
    () => props.conversationId,
  );
  const loading = createDmMessagesLoading(
    core.directMessages,
    () => props.conversationId,
  );
  const [reportTarget, setReportTarget] = createSignal<DmReportTarget | null>(
    null,
  );
  const [reportNotice, setReportNotice] = createSignal<string | null>(null);

  const send = async (content: string, options?: DmSendOptions) => {
    await core.directMessages.sendMessage(
      props.conversationId,
      content,
      options,
    );
  };

  const openReport = (message: DirectMessage, authorName: string) => {
    setReportNotice(null);
    setReportTarget({ message, authorName });
  };

  const submitReport = async (input: {
    kind: DirectMessageReportKind;
    comment: string;
  }) => {
    const target = reportTarget();
    if (!target) return;
    await core.directMessages.reportMessage({
      messageId: target.message.messageId,
      kind: input.kind,
      comment: input.comment,
    });
    setReportTarget(null);
    setReportNotice("Report submitted.");
  };

  const viewerId = () => session()?.user.id ?? null;

  // Open at the newest message (bottom) and follow new messages — standard chat
  // behavior. Channels get this from virtua; the DM thread is a plain scroller,
  // so we pin it to the bottom on conversation switch + when a message arrives.
  let scrollContainer: HTMLDivElement | undefined;
  createEffect(() => {
    void props.conversationId;
    void messages().length;
    queueMicrotask(() => {
      scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight });
    });
  });

  return (
    <>
      <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Avatar
          src={
            props.conversation
              ? resolveLiveAvatarUrl(
                  liveProfiles(),
                  props.conversation.otherUserId,
                  props.conversation.otherAvatarUrl,
                )
              : null
          }
          name={props.title}
          size="md"
        />
        <span class="min-w-0 truncate font-semibold text-foreground">
          {props.title}
        </span>
      </header>

      <div
        ref={scrollContainer}
        class="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <Show when={reportNotice()}>
          <div class="mb-2 rounded border border-border bg-surface-panel px-3 py-2 text-sm text-muted-foreground">
            {reportNotice()}
          </div>
        </Show>
        <Show
          when={!loading()}
          fallback={
            <div class="flex h-full items-center justify-center text-muted-foreground">
              Loading...
            </div>
          }
        >
          <Show
            when={messages().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center text-muted-foreground">
                No messages yet.
              </div>
            }
          >
            <div class="flex flex-col gap-0.5">
              <For each={messages()}>
                {(message) => (
                  <DmMessageRow
                    message={message}
                    self={message.authorUserId === viewerId()}
                    authorName={
                      resolveLiveUsername(
                        liveProfiles(),
                        message.authorUserId,
                        message.authorUsername,
                      ) ?? "Unknown"
                    }
                    avatarUrl={resolveLiveAvatarUrl(
                      liveProfiles(),
                      message.authorUserId,
                      message.authorAvatarUrl,
                    )}
                    onReport={openReport}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <DmComposer recipientName={props.title} onSend={send} />
      <DmReportDialog
        target={reportTarget()}
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
    </>
  );
}

function DmMessageRow(props: {
  message: DirectMessage;
  self: boolean;
  authorName: string;
  avatarUrl: string | null;
  onReport: (message: DirectMessage, authorName: string) => void;
}) {
  return (
    <div
      class="group flex gap-2 rounded px-1 py-1.5 hover:bg-surface-message-row-hover"
      classList={{ "flex-row-reverse": props.self }}
    >
      <Avatar src={props.avatarUrl} name={props.authorName} size="md" />
      <div class="min-w-0 max-w-[72%]" classList={{ "text-right": props.self }}>
        <div
          class="mb-0.5 flex items-baseline gap-2"
          classList={{ "justify-end": props.self }}
        >
          <span class="text-sm font-semibold text-foreground">
            {props.self ? "You" : props.authorName}
          </span>
          <span class="text-xs text-muted-foreground">
            {timeLabel(props.message.createdAt)}
          </span>
        </div>
        <Show
          when={props.message.deletedAt === null}
          fallback={
            <p class="text-sm italic text-muted-foreground">Message deleted</p>
          }
        >
          <Markdown content={props.message.content} class="text-foreground" />
          <Show when={props.message.attachments.length > 0}>
            <div class="mt-1 flex flex-wrap gap-2">
              <For each={props.message.attachments}>
                {(attachment) => (
                  <Show
                    when={attachment.signedUrl}
                    fallback={
                      <span class="inline-flex items-center gap-1 rounded bg-surface-embed-chip px-2 py-1 text-xs text-attachment-label">
                        <ImageIcon size={12} />
                        {attachment.originalFilename ?? "Image"}
                      </span>
                    }
                  >
                    {(src) => (
                      <img
                        src={src()}
                        alt={attachment.originalFilename ?? "Image attachment"}
                        class="max-h-60 max-w-full rounded border border-border object-contain"
                      />
                    )}
                  </Show>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
      <Show when={props.message.deletedAt === null}>
        <Tooltip content="Report" placement="top">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Report direct message"
            class="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={() => props.onReport(props.message, props.authorName)}
          >
            <Flag size={14} />
          </Button>
        </Tooltip>
      </Show>
    </div>
  );
}

function DmReportDialog(props: {
  target: DmReportTarget | null;
  onClose: () => void;
  onSubmit: (input: {
    kind: DirectMessageReportKind;
    comment: string;
  }) => Promise<void>;
}) {
  const [kind, setKind] =
    createSignal<DirectMessageReportKind>("content_abuse");
  const [comment, setComment] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    if (!props.target) {
      setKind("content_abuse");
      setComment("");
      setSubmitting(false);
      setError(null);
    }
  });

  const messagePreview = () => {
    const target = props.target;
    if (!target) return "";
    const text = target.message.content.trim();
    if (text) return text;
    if (target.message.attachments.length > 0) return "Image attachment";
    return "Empty message";
  };

  const submit = async () => {
    const trimmedComment = comment().trim();
    if (!trimmedComment) {
      setError("Please add a brief reason for this report.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await props.onSubmit({ kind: kind(), comment: trimmedComment });
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Failed to submit report."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Show when={props.target}>
      {(target) => (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={props.onClose}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-report-title"
            class="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-border-dialog bg-card p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <h2
                  id="dm-report-title"
                  class="text-base font-semibold text-foreground"
                >
                  Report direct message
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  Reports go to the Haven Moderation Team.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8"
                aria-label="Close report dialog"
                disabled={submitting()}
                onClick={props.onClose}
              >
                <X size={16} />
              </Button>
            </div>

            <div class="mt-4 min-h-0 overflow-y-auto">
              <div class="rounded border border-border bg-surface-panel p-3">
                <p class="text-xs uppercase text-muted-foreground">
                  Reported user
                </p>
                <p class="mt-1 truncate text-sm font-semibold text-foreground">
                  {target().authorName}
                </p>
                <p class="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-body-soft">
                  {messagePreview()}
                </p>
              </div>

              <p class="mb-2 mt-4 text-xs uppercase text-muted-foreground">
                Type
              </p>
              <div class="grid gap-2">
                <For each={DM_REPORT_KIND_OPTIONS}>
                  {(option) => (
                    <button
                      type="button"
                      class="rounded border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      classList={{
                        "border-primary bg-surface-panel":
                          kind() === option.value,
                        "border-border-control": kind() !== option.value,
                      }}
                      disabled={submitting()}
                      onClick={() => setKind(option.value)}
                    >
                      {option.label}
                    </button>
                  )}
                </For>
              </div>

              <label class="mb-2 mt-4 block text-xs uppercase text-muted-foreground">
                Comment
              </label>
              <textarea
                value={comment()}
                disabled={submitting()}
                placeholder="Describe what happened"
                onInput={(event) => setComment(event.currentTarget.value)}
                class="min-h-24 w-full resize-y rounded border border-border-control bg-surface-panel px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-60"
              />
              <Show when={error()}>
                <p class="mt-2 text-sm text-send-error">{error()}</p>
              </Show>
            </div>

            <div class="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={submitting()}
                onClick={props.onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={submitting()}
                onClick={() => void submit()}
              >
                {submitting() ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </Show>
  );
}

type PendingImage = {
  file: File;
  previewUrl: string;
};

function DmComposer(props: {
  recipientName: string;
  onSend: (content: string, options?: DmSendOptions) => Promise<void>;
}) {
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [pendingImage, setPendingImage] = createSignal<PendingImage | null>(
    null,
  );
  const retainedPreviewUrls = new Set<string>();
  let textarea: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;

  const autogrow = () => {
    if (!textarea) return;
    textarea.style.height = "0";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const clearPendingImage = (options?: { retainPreview?: boolean }) => {
    const current = pendingImage();
    if (current) {
      if (options?.retainPreview) retainedPreviewUrls.add(current.previewUrl);
      else URL.revokeObjectURL(current.previewUrl);
    }
    setPendingImage(null);
    if (fileInput) fileInput.value = "";
  };

  onCleanup(() => {
    clearPendingImage();
    for (const url of retainedPreviewUrls) URL.revokeObjectURL(url);
    retainedPreviewUrls.clear();
  });

  const pickImage = () => {
    if (sending()) return;
    fileInput?.click();
  };

  const setPickedImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.toLowerCase().startsWith("image/")) {
      setError("Direct messages only support image attachments.");
      if (fileInput) fileInput.value = "";
      return;
    }
    clearPendingImage();
    setError(null);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const submit = async () => {
    const content = normalizeCommunityMarkdown(draft());
    const image = pendingImage();
    if ((!content.trim() && !image) || sending()) return;
    setSending(true);
    setError(null);
    try {
      await props.onSend(content.trim(), {
        ...(image
          ? {
              imageUpload: {
                body: image.file,
                filename: image.file.name || `upload-${Date.now()}`,
              },
              optimisticAttachmentUri: image.previewUrl,
            }
          : {}),
      });
      setDraft("");
      if (textarea) textarea.value = "";
      clearPendingImage({ retainPreview: true });
      autogrow();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to send direct message."));
    } finally {
      setSending(false);
      textarea?.focus();
    }
  };

  return (
    <div class="shrink-0 border-t border-border px-4 pb-4 pt-3">
      <Show when={error()}>
        <p class="mb-1 text-xs text-send-error">{error()}</p>
      </Show>
      <Show when={pendingImage()}>
        {(image) => (
          <div class="mb-2 flex items-center gap-2 rounded border border-border bg-surface-embed-chip px-2 py-2">
            <img
              src={image().previewUrl}
              alt=""
              class="h-12 w-12 rounded object-cover"
            />
            <span class="min-w-0 flex-1 truncate text-xs text-attachment-label">
              {image().file.name || "Image"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              class="h-7 w-7"
              aria-label="Remove image attachment"
              disabled={sending()}
              onClick={() => clearPendingImage()}
            >
              <X size={15} />
            </Button>
          </div>
        )}
      </Show>
      <div class="flex items-end gap-2 rounded-xl bg-surface-input px-3 py-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={(event) => {
            setPickedImage(event.currentTarget.files?.[0]);
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Attach image"
          disabled={sending()}
          onClick={pickImage}
          class="h-8 w-8"
        >
          <ImagePlus size={18} />
        </Button>
        <textarea
          ref={textarea}
          rows={1}
          value={draft()}
          placeholder={`Message ${props.recipientName}`}
          onInput={(event) => {
            setDraft(event.currentTarget.value);
            autogrow();
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          class="max-h-[200px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Send direct message"
          disabled={sending() || (!draft().trim() && !pendingImage())}
          onClick={() => void submit()}
          class="h-8 w-8"
        >
          <SendHorizontal size={18} />
        </Button>
      </div>
    </div>
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
