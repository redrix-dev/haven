import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import { Badge } from "@shared/app/ui/badge";
import { Button } from "@shared/app/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/app/ui/alert-dialog";
import { ScrollArea } from "@shared/app/ui/scroll-area";
import { Skeleton } from "@shared/app/ui/skeleton";
import { Textarea } from "@shared/app/ui/textarea";
import {
  MessageToolbar,
  type MessageToolbarHandle,
} from "@web-client/components/MessageToolbar";
import {
  RichComposerInput,
  useRichComposer,
} from "@web-client/components/messaging/richComposer";
import {
  DmReportModal,
  type DmReportTarget,
} from "@web-client/components/direct-messages/DmReportModal";
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from "@shared/lib/backend/types";
import {
  Flag,
  ImagePlus,
  RefreshCcw,
  Send,
  ShieldBan,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { MarkdownText } from "@shared/app/ui/MarkdownText";
import {
  DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT,
  getDirectMessagePreviewText,
  getVisibleDirectMessageText,
} from "@shared/lib/backend/directMessageUtils";
import {
  resolveLiveAvatarUrl,
  resolveLiveUsername,
} from "@shared/infrastructure/liveProfiles";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";

type DirectMessageAreaProps = {
  conversation: DirectMessageConversationSummary | null;
  currentUserId: string;
  currentUserDisplayName: string;
  messages: DirectMessage[];
  loading: boolean;
  sending: boolean;
  refreshing?: boolean;
  error: string | null;
  messagingUnavailable?: boolean;
  onRefresh: () => void;
  onSendMessage: (
    content: string,
    options?: {
      imageBody?: Blob;
      imageFilename?: string;
      imageExpiresInHours?: number;
    },
  ) => Promise<void>;
  onToggleMute: (muted: boolean) => Promise<void>;
  onBlockUser: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }) => Promise<void>;
  enableRichComposer?: boolean;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
};

const getInitial = (value: string | null) =>
  value?.trim().charAt(0).toUpperCase() || "D";

const getConversationErrorHint = (error: string | null) => {
  if (!error) return null;
  const normalized = error.toLowerCase();
  if (
    normalized.includes("friends list") ||
    normalized.includes("already friends")
  ) {
    return "Direct messages are friends-only right now. Re-add the user as a friend to continue.";
  }
  if (normalized.includes("blocked")) {
    return "This DM is unavailable because one of you has blocked the other.";
  }
  if (
    normalized.includes("do not have access") ||
    normalized.includes("access")
  ) {
    return "You no longer have access to this conversation. It may have been removed or restricted.";
  }
  return null;
};

const getUiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
};

const getAttachmentLabel = (attachment: DirectMessageAttachment): string =>
  attachment.originalFilename ??
  attachment.objectPath.split("/").pop() ??
  "image";

export function DirectMessageArea({
  conversation,
  currentUserId,
  currentUserDisplayName,
  messages,
  loading,
  sending,
  refreshing = false,
  error,
  messagingUnavailable = false,
  onRefresh,
  onSendMessage,
  onToggleMute,
  onBlockUser,
  onReportMessage,
  enableRichComposer = false,
}: DirectMessageAreaProps) {
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const [draft, setDraft] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);
  const [blockingUser, setBlockingUser] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<DmReportTarget | null>(
    null,
  );
  const [imageAttachment, setImageAttachment] = React.useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [imageExpiresInHours, setImageExpiresInHours] = React.useState(24);
  const [pendingBlockConfirm, setPendingBlockConfirm] = React.useState<{
    userId: string;
    username: string;
  } | null>(null);
  const dmInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const toolbarRef = React.useRef<MessageToolbarHandle | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const scrollAreaRootRef = React.useRef<HTMLDivElement | null>(null);

  const clearImageAttachment = React.useCallback(() => {
    setImageAttachment((previousValue) => {
      if (previousValue) {
        URL.revokeObjectURL(previousValue.previewUrl);
      }
      return null;
    });
    setImageExpiresInHours(24);
  }, []);

  React.useEffect(() => {
    setDraft("");
    setActionError(null);
    setActionNotice(null);
    setBlockingUser(false);
    setReportTarget(null);
    setPendingBlockConfirm(null);
    clearImageAttachment();
  }, [clearImageAttachment, conversation?.conversationId]);

  React.useEffect(
    () => () => {
      clearImageAttachment();
    },
    [clearImageAttachment],
  );

  React.useEffect(() => {
    const viewport = scrollAreaRootRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, conversation?.conversationId]);

  const handleSend = async () => {
    const next = draft.trim();
    if ((!next && !imageAttachment) || !conversation) return;
    setActionError(null);
    setActionNotice(null);
    try {
      await onSendMessage(next, {
        imageBody: imageAttachment?.file,
        imageFilename: imageAttachment?.file.name,
        imageExpiresInHours: imageAttachment ? imageExpiresInHours : undefined,
      });
      setDraft("");
      clearImageAttachment();
    } catch (sendError) {
      setActionError(getUiErrorMessage(sendError, "Failed to send DM."));
    }
  };

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (enableRichComposer) return;
    if (toolbarRef.current?.handleKeyboardShortcut(event)) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleSelectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!nextFile) return;

    setImageAttachment((previousValue) => {
      if (previousValue) {
        URL.revokeObjectURL(previousValue.previewUrl);
      }
      return {
        file: nextFile,
        previewUrl: URL.createObjectURL(nextFile),
      };
    });
    setActionError(null);
  };

  const handleBlockUser = () => {
    if (!conversation?.otherUserId) return;
    const targetUsername =
      resolveLiveUsername(
        liveProfiles,
        conversation.otherUserId,
        conversation.otherUsername,
      )?.trim() || "this user";
    setPendingBlockConfirm({
      userId: conversation.otherUserId,
      username: targetUsername,
    });
  };

  const confirmBlockUser = async () => {
    if (!pendingBlockConfirm) return;
    const { userId, username } = pendingBlockConfirm;
    setPendingBlockConfirm(null);

    setActionError(null);
    setActionNotice(null);
    setBlockingUser(true);
    try {
      await onBlockUser({
        userId,
        username,
      });
      setActionNotice(`Blocked ${username}.`);
    } catch (blockError) {
      setActionError(getUiErrorMessage(blockError, "Failed to block user."));
    } finally {
      setBlockingUser(false);
    }
  };

  const handleReportSubmit = async (input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }) => {
    setActionError(null);
    setActionNotice(null);
    await onReportMessage(input);
    setActionNotice("DM report submitted to Haven.");
  };

  const dmTitle =
    conversation
      ? resolveLiveUsername(
          liveProfiles,
          conversation.otherUserId,
          conversation.otherUsername,
        ) ?? "Direct Message"
      : "Direct Message";

  const richComposer = useRichComposer({
    markdown: draft,
    onMarkdownChange: setDraft,
    placeholder: `Message ${dmTitle}`,
    onSubmit: () => {
      void handleSend();
    },
    disabled: sending || messagingUnavailable || !conversation,
  });

  if (!conversation) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-surface-app text-muted-foreground">
        <div className="rounded-md border border-dashed border-border bg-surface-panel/60 p-6 max-w-md text-center">
          <p className="text-white font-semibold">Select a direct message</p>
          <p className="mt-2 text-sm">
            Open a DM from the Friends panel, or select an existing thread from
            the DM list.
          </p>
        </div>
      </div>
    );
  }

  const title = dmTitle;
  const otherAvatarUrl = resolveLiveAvatarUrl(
    liveProfiles,
    conversation.otherUserId,
    conversation.otherAvatarUrl,
  );
  const errorHint = getConversationErrorHint(error);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-surface-app">
      <div className="flex h-16 shrink-0 items-center border-b border-surface-hover bg-surface-panel px-4">
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar className="size-10 rounded-xl border border-border bg-surface-skeleton">
              {otherAvatarUrl && (
                <AvatarImage src={otherAvatarUrl} alt={title} />
              )}
              <AvatarFallback className="rounded-xl bg-surface-skeleton text-white text-xs">
                {getInitial(title)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {title}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>1:1 Direct Message</span>
                {conversation.isMuted && (
                  <Badge
                    variant="outline"
                    className="border-border text-pill"
                  >
                    Muted
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border text-white"
              onClick={onRefresh}
              disabled={loading || refreshing}
            >
              <RefreshCcw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border text-white"
              onClick={() => {
                void onToggleMute(!conversation.isMuted).catch(
                  (toggleError) => {
                    setActionError(
                      getUiErrorMessage(toggleError, "Failed to update mute."),
                    );
                  },
                );
              }}
            >
              {conversation.isMuted ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
              {conversation.isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-border-dm-warn text-destructive-banner hover:bg-surface-dm-warn-hover"
              onClick={handleBlockUser}
              disabled={blockingUser || !conversation.otherUserId}
            >
              <ShieldBan className="size-4" />
              {blockingUser ? "Blocking..." : "Block"}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <ScrollArea ref={scrollAreaRootRef} className="h-full min-h-0 min-w-0">
          <div className="min-w-0 space-y-3 p-4">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-md border border-border bg-surface-panel px-3 py-3"
                >
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-9 rounded-xl bg-surface-hover" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-28 bg-surface-hover" />
                        <Skeleton className="h-3 w-24 bg-surface-skeleton" />
                      </div>
                      <Skeleton className="h-3 w-full bg-surface-skeleton" />
                      <Skeleton className="h-3 w-5/6 bg-surface-skeleton" />
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="rounded-md border border-border-destructive-panel bg-surface-destructive-panel p-3">
                <p className="text-sm text-red-300">{error}</p>
                {errorHint && (
                  <p className="mt-1 text-xs text-destructive-banner">{errorHint}</p>
                )}
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface-panel/60 p-4">
                <p className="text-sm text-muted-foreground">No messages yet.</p>
                <p className="mt-1 text-xs text-auxiliary">
                  Say hi to start the conversation.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isSelf = message.authorUserId === currentUserId;
                const authorUsername = isSelf
                  ? currentUserDisplayName
                  : (resolveLiveUsername(
                      liveProfiles,
                      message.authorUserId,
                      message.authorUsername,
                    ) ?? message.authorUserId.substring(0, 12));
                const authorAvatarUrl = resolveLiveAvatarUrl(
                  liveProfiles,
                  message.authorUserId,
                  message.authorAvatarUrl,
                );
                const visibleText = getVisibleDirectMessageText(
                  message.content,
                  message.attachments.length,
                );
                const messagePreview =
                  getDirectMessagePreviewText(
                    message.content,
                    message.attachments.length,
                  ) ?? DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT;

                return (
                  <div
                    key={message.messageId}
                    className={`max-w-full min-w-0 rounded-md border px-3 py-3 ${
                      isSelf
                        ? "border-border-dm-selected bg-surface-row-active"
                        : "border-border bg-surface-panel"
                    }`}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="size-9 rounded-xl border border-border bg-surface-skeleton">
                        {authorAvatarUrl && (
                          <AvatarImage
                            src={authorAvatarUrl}
                            alt={authorUsername}
                          />
                        )}
                        <AvatarFallback className="rounded-xl bg-surface-skeleton text-white text-xs">
                          {getInitial(authorUsername)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="min-w-0 max-w-full truncate text-sm font-semibold text-white">
                            {isSelf
                              ? `${currentUserDisplayName} (You)`
                              : authorUsername}
                          </p>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatTimestamp(message.createdAt)}
                          </span>
                          {message.editedAt && (
                            <Badge
                              variant="outline"
                              className="border-border text-muted-foreground"
                            >
                              Edited
                            </Badge>
                          )}
                        </div>
                        {visibleText && (
                          <div className="mt-1 min-w-0 max-w-full text-sm text-banner">
                            <MarkdownText content={visibleText} />
                          </div>
                        )}
                        {message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => {
                              const attachmentLabel =
                                getAttachmentLabel(attachment);
                              const expiresAtLabel = new Date(
                                attachment.expiresAt,
                              ).toLocaleString();

                              return (
                                <div key={attachment.id} className="space-y-1">
                                  {attachment.signedUrl ? (
                                    <img
                                      src={attachment.signedUrl}
                                      alt={attachmentLabel}
                                      className="max-h-80 max-w-full rounded-md border border-border bg-surface-desktop-shell object-contain"
                                    />
                                  ) : (
                                    <div className="rounded-md border border-dashed border-border bg-surface-desktop-shell px-3 py-2 text-xs text-muted-foreground">
                                      Image unavailable
                                    </div>
                                  )}
                                  <p className="text-[11px] text-muted-foreground">
                                    {attachmentLabel} | Expires {expiresAtLabel}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {!isSelf && (
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-white hover:bg-surface-hover"
                              onClick={() => {
                                setActionError(null);
                                setActionNotice(null);
                                setReportTarget({
                                  messageId: message.messageId,
                                  authorUsername,
                                  messagePreview,
                                });
                              }}
                            >
                              <Flag className="size-4" />
                              Report
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="shrink-0 border-t border-surface-hover bg-surface-panel p-3">
        <div className="space-y-2">
          {messagingUnavailable ? (
            <div className="rounded-md border border-border bg-surface-app px-3 py-3 text-sm text-muted-foreground">
              Messaging is unavailable in this conversation.
            </div>
          ) : (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleSelectImage}
              />
              {imageAttachment && (
                <div className="rounded-md border border-border bg-surface-app px-3 py-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={imageAttachment.previewUrl}
                      alt={imageAttachment.file.name || "Selected image"}
                      className="size-16 rounded-md border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Image attached
                      </p>
                      <p className="mt-1 text-sm text-white truncate">
                        {imageAttachment.file.name}
                      </p>
                      <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                        Expires
                        <select
                          value={imageExpiresInHours}
                          onChange={(event) =>
                            setImageExpiresInHours(Number(event.target.value))
                          }
                          className="rounded border border-border bg-surface-legal px-2 py-1 text-xs text-white"
                          disabled={sending}
                        >
                          <option value={1}>1h</option>
                          <option value={24}>24h</option>
                          <option value={168}>7d</option>
                          <option value={720}>30d</option>
                        </select>
                      </label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-white"
                      onClick={clearImageAttachment}
                      disabled={sending}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
              <MessageToolbar
                inputRef={enableRichComposer ? undefined : dmInputRef}
                value={draft}
                onChange={setDraft}
                ref={toolbarRef}
                richActions={enableRichComposer ? richComposer.actions : undefined}
              />
              {enableRichComposer ? (
                <div className="rounded-md border border-border bg-surface-app px-3">
                  <RichComposerInput editor={richComposer.editor} />
                </div>
              ) : (
                <Textarea
                  ref={dmInputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={`Message ${title}`}
                  className="min-h-[84px] resize-y bg-surface-app border-border text-white placeholder:text-muted-foreground"
                  disabled={sending}
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border text-white"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={sending}
                  >
                    <ImagePlus className="size-4" />
                    Attach Image
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Enter sends; Shift+Enter for newline
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || (!draft.trim() && !imageAttachment)}
                >
                  <Send className="size-4" />
                  Send
                </Button>
              </div>
            </>
          )}
          {actionNotice && (
            <p className="text-sm text-notice-success">{actionNotice}</p>
          )}
          {actionError && <p className="text-sm text-red-300">{actionError}</p>}
        </div>
      </div>

      <DmReportModal
        open={Boolean(reportTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReportTarget(null);
          }
        }}
        target={reportTarget}
        onSubmit={handleReportSubmit}
      />

      <AlertDialog
        open={Boolean(pendingBlockConfirm)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingBlockConfirm(null);
          }
        }}
      >
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Block User?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {pendingBlockConfirm
                ? `Block "${pendingBlockConfirm.username}"? This removes the friendship, cancels pending requests, and blocks future DMs.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={blockingUser}
              className="bg-muted border-border text-white hover:bg-secondary"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={blockingUser}
              onClick={() => {
                void confirmBlockUser();
              }}
            >
              {blockingUser ? "Blocking..." : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
