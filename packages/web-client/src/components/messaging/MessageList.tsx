import React, { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@shared/app/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@shared/app/ui/collapsible";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/app/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@shared/app/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@shared/app/ui/context-menu";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/app/ui/dialog";
import { Input } from "@shared/app/ui/input";
import { Textarea } from "@shared/app/ui/textarea";
import { ProfileContextMenu } from "@web-client/components/ProfileContextMenu";
import { ActionMenuContent } from "@web-client/components/menus/ActionMenuContent";
import {
  BANNED_REPLY_PLACEHOLDER_CONTENT,
  isModerationRemovedReplyPlaceholder,
} from "@shared/features/messaging/lib/banVisibility";
import { resolveContextMenuIntent } from "@shared/infrastructure/contextMenu";
import { traceContextMenuEvent } from "@shared/infrastructure/contextMenu/debugTrace";
import { getErrorMessage } from "@platform/lib/errors";
import type { MenuActionNode } from "@shared/infrastructure/contextMenu/types";
import type {
  BanEligibleServer,
  Message,
  MessageAttachment,
  MessageBundle,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { MarkdownText } from "@shared/app/ui/MarkdownText";
import {
  QUICK_REACTION_EMOJI,
  messageContainsHttpUrl,
  renderLinkifiedMessageText,
} from "@web-client/utils/messageLinkRendering";
import { getFallbackEmbedUrl } from "@shared/features/messaging/utils/embedUtils";
import {
  isAuthorProfileTombstone,
  type MessageListAuthorProfile,
} from "@shared/features/profile/utils/profileTombstone";
import { getLiveProfile } from "@shared/infrastructure/liveProfiles";
import { useHavenCore } from "@shared/core";

function getReplyToMessageIdFromBundle(bundle: MessageBundle): string | null {
  const direct = bundle.replyToMessageId?.trim();
  if (direct) return direct;
  return null;
}

function getAuthorLabelForBundle(
  bundle: MessageBundle,
  authorProfile: MessageListAuthorProfile | undefined,
  currentUserId: string,
): string {
  const username =
    authorProfile?.username ??
    bundle.displayName ??
    bundle.authorUserId?.substring(0, 12) ??
    "Unknown User";
  if (bundle.authorUserId === currentUserId) return `${username} (You)`;
  return username;
}

function getAuthorColorForBundle(
  bundle: MessageBundle,
  authorProfile: MessageListAuthorProfile | undefined,
  currentUserId: string,
): string {
  const isOwn = bundle.authorUserId === currentUserId;
  const isStaff = Boolean(bundle.isPlatformStaff);
  if (isOwn) return "var(--primary)";
  if (isStaff) return "var(--link)";
  return "var(--status-online)";
}

type AuthorProfile = MessageListAuthorProfile;

interface MessageListProps {
  channelId: string;
  messages: MessageBundle[];
  currentUserId: string;
  canManageMessages: boolean;
  canCreateReports: boolean;
  canManageBans: boolean;
  canManageMembers: boolean;
  canRefreshLinkPreviews: boolean;
  onSaveAttachment: (attachment: MessageAttachment) => Promise<void>;
  onReportUserProfile: (input: {
    targetUserId: string;
    reason: string;
  }) => Promise<void>;
  onBanUserFromServer: (input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) => Promise<void>;
  onKickUserFromCurrentServer: (input: {
    targetUserId: string;
    username: string;
  }) => Promise<void>;
  onResolveBanEligibleServers: (
    targetUserId: string,
  ) => Promise<BanEligibleServer[]>;
  onDirectMessageUser: (targetUserId: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  onReplyToMessage: (target: {
    id: string;
    authorLabel: string;
    preview: string;
  }) => void;
  onReportMessage: (input: {
    messageId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) => Promise<void>;
  onRequestMessageLinkPreviewRefresh: (messageId: string) => Promise<void>;
  onRequestOlderMessages?: () => Promise<void>;
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  bottomInset?: number;
}

type MessageReactionSummaryState = {
  count: number;
  reactedByCurrentUser: boolean;
};

interface MessageRowProps {
  message: MessageBundle;
  depth: number;
  currentUserId: string;
  canManageMessages: boolean;
  canCreateReports: boolean;
  canManageBans: boolean;
  canManageMembers: boolean;
  canRefreshLinkPreviews: boolean;
  authorProfile: AuthorProfile | undefined;
  isEditing: boolean;
  editingContent: string;
  isActionBusy: boolean;
  reactionBusyKeys: React.RefObject<Readonly<Record<string, boolean>>>;
  messageReactionMap: ReadonlyMap<string, MessageReactionSummaryState>;
  messageAttachmentRows: readonly MessageAttachment[];
  messageLinkPreviewRow: MessageLinkPreview | null;
  getRenderableEmbedUrl: (preview: MessageLinkPreview) => string | null;
  onStartEditingMessage: (messageId: string, content: string) => void;
  onEditingContentChange: (content: string) => void;
  onSaveEditedMessage: (messageId: string, content: string) => void;
  onCancelEditingMessage: () => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyToMessage: (target: {
    id: string;
    authorLabel: string;
    preview: string;
  }) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onOpenMessageReport: (messageId: string) => void;
  onRefreshLinkPreview: (messageId: string) => void;
  onSaveAttachment: (attachment: MessageAttachment) => void;
  onReportUserProfile: (targetUserId: string) => void;
  onBanUser: (targetUserId: string, communityId: string) => void;
  onKickUser: (targetUserId: string) => void;
  onDirectMessageUser: (targetUserId: string) => void;
  onResolveBanEligibleServers: (
    targetUserId: string,
  ) => Promise<BanEligibleServer[]>;
}

interface MessageTreeSharedProps extends Omit<
  MessageRowProps,
  | "message"
  | "depth"
  | "authorProfile"
  | "isEditing"
  | "editingContent"
  | "isActionBusy"
  | "messageReactionMap"
  | "messageAttachmentRows"
  | "messageLinkPreviewRow"
> {
  editingMessageId: string | null;
  activeEditingContent: string;
  actionBusyMessageId: string | null;
  expandedReplyThreads: Readonly<Record<string, boolean>>;
  repliesByParentId: ReadonlyMap<string, MessageBundle[]>;
  attachmentsByMessageId: ReadonlyMap<string, MessageAttachment[]>;
  linkPreviewByMessageId: ReadonlyMap<string, MessageLinkPreview>;
  reactionsByMessageId: ReadonlyMap<
    string,
    ReadonlyMap<string, MessageReactionSummaryState>
  >;
  authorProfilesByMessageId: ReadonlyMap<string, AuthorProfile | undefined>;
  onReplyThreadOpenChange: (messageId: string, nextOpen: boolean) => void;
}

interface MessageTreeItemProps extends MessageTreeSharedProps {
  message: MessageBundle;
  depth: number;
  ancestorPath: string;
}

interface MessageVirtuosoItemProps extends MessageTreeSharedProps {
  message: MessageBundle;
}

const EMPTY_MESSAGE_ATTACHMENTS: readonly MessageAttachment[] = [];
const EMPTY_MESSAGE_REACTION_MAP: ReadonlyMap<
  string,
  MessageReactionSummaryState
> = new Map<string, MessageReactionSummaryState>();
const EMPTY_REPLY_MESSAGES: readonly MessageBundle[] = [];
const ANCESTOR_PATH_SEPARATOR = "\u0000";

const areAuthorProfilesEqual = (
  previousProfile: AuthorProfile | undefined,
  nextProfile: AuthorProfile | undefined,
): boolean => {
  if (previousProfile === nextProfile) return true;
  if (!previousProfile || !nextProfile) return false;
  return (
    previousProfile.username === nextProfile.username &&
    previousProfile.isPlatformStaff === nextProfile.isPlatformStaff &&
    previousProfile.displayPrefix === nextProfile.displayPrefix &&
    previousProfile.avatarUrl === nextProfile.avatarUrl
  );
};

const areMessageAttachmentsEqual = (
  previousAttachments: readonly MessageAttachment[],
  nextAttachments: readonly MessageAttachment[],
): boolean => {
  if (previousAttachments === nextAttachments) return true;
  if (previousAttachments.length !== nextAttachments.length) return false;

  for (let index = 0; index < previousAttachments.length; index += 1) {
    const previousAttachment = previousAttachments[index];
    const nextAttachment = nextAttachments[index];

    if (previousAttachment === nextAttachment) continue;
    if (
      previousAttachment.id !== nextAttachment.id ||
      previousAttachment.signedUrl !== nextAttachment.signedUrl ||
      previousAttachment.expiresAt !== nextAttachment.expiresAt ||
      previousAttachment.mediaKind !== nextAttachment.mediaKind ||
      previousAttachment.originalFilename !== nextAttachment.originalFilename ||
      previousAttachment.objectPath !== nextAttachment.objectPath
    ) {
      return false;
    }
  }

  return true;
};

const areMessageReactionMapsEqual = (
  previousReactionMap: ReadonlyMap<string, MessageReactionSummaryState>,
  nextReactionMap: ReadonlyMap<string, MessageReactionSummaryState>,
): boolean => {
  if (previousReactionMap === nextReactionMap) return true;
  if (previousReactionMap.size !== nextReactionMap.size) return false;

  for (const [emoji, previousSummary] of previousReactionMap.entries()) {
    const nextSummary = nextReactionMap.get(emoji);
    if (!nextSummary) return false;
    if (
      previousSummary.count !== nextSummary.count ||
      previousSummary.reactedByCurrentUser !== nextSummary.reactedByCurrentUser
    ) {
      return false;
    }
  }

  return true;
};

const areMessagesEqual = (
  previousMessage: MessageBundle,
  nextMessage: MessageBundle,
) => {
  if (previousMessage === nextMessage) return true;

  return (
    previousMessage.id === nextMessage.id &&
    previousMessage.authorUserId === nextMessage.authorUserId &&
    previousMessage.content === nextMessage.content &&
    previousMessage.createdAt === nextMessage.createdAt &&
    previousMessage.isHidden === nextMessage.isHidden &&
    previousMessage.metadata === nextMessage.metadata
  );
};

const areMessageRowPropsEqual = (
  previousProps: MessageRowProps,
  nextProps: MessageRowProps,
): boolean => {
  return (
    areMessagesEqual(previousProps.message, nextProps.message) &&
    previousProps.depth === nextProps.depth &&
    previousProps.currentUserId === nextProps.currentUserId &&
    previousProps.canManageMessages === nextProps.canManageMessages &&
    previousProps.canCreateReports === nextProps.canCreateReports &&
    previousProps.canManageBans === nextProps.canManageBans &&
    previousProps.canManageMembers === nextProps.canManageMembers &&
    previousProps.canRefreshLinkPreviews === nextProps.canRefreshLinkPreviews &&
    areAuthorProfilesEqual(
      previousProps.authorProfile,
      nextProps.authorProfile,
    ) &&
    previousProps.isEditing === nextProps.isEditing &&
    previousProps.editingContent === nextProps.editingContent &&
    previousProps.isActionBusy === nextProps.isActionBusy &&
    previousProps.messageLinkPreviewRow === nextProps.messageLinkPreviewRow &&
    areMessageAttachmentsEqual(
      previousProps.messageAttachmentRows,
      nextProps.messageAttachmentRows,
    ) &&
    areMessageReactionMapsEqual(
      previousProps.messageReactionMap,
      nextProps.messageReactionMap,
    ) &&
    previousProps.reactionBusyKeys === nextProps.reactionBusyKeys &&
    previousProps.getRenderableEmbedUrl === nextProps.getRenderableEmbedUrl &&
    previousProps.onStartEditingMessage === nextProps.onStartEditingMessage &&
    previousProps.onEditingContentChange === nextProps.onEditingContentChange &&
    previousProps.onSaveEditedMessage === nextProps.onSaveEditedMessage &&
    previousProps.onCancelEditingMessage === nextProps.onCancelEditingMessage &&
    previousProps.onDeleteMessage === nextProps.onDeleteMessage &&
    previousProps.onReplyToMessage === nextProps.onReplyToMessage &&
    previousProps.onToggleReaction === nextProps.onToggleReaction &&
    previousProps.onOpenMessageReport === nextProps.onOpenMessageReport &&
    previousProps.onRefreshLinkPreview === nextProps.onRefreshLinkPreview &&
    previousProps.onSaveAttachment === nextProps.onSaveAttachment &&
    previousProps.onReportUserProfile === nextProps.onReportUserProfile &&
    previousProps.onBanUser === nextProps.onBanUser &&
    previousProps.onKickUser === nextProps.onKickUser &&
    previousProps.onDirectMessageUser === nextProps.onDirectMessageUser &&
    previousProps.onResolveBanEligibleServers ===
      nextProps.onResolveBanEligibleServers
  );
};

const MessageRow = React.memo(function MessageRow({
  message,
  depth,
  currentUserId,
  canManageMessages,
  canCreateReports,
  canManageBans,
  canManageMembers,
  canRefreshLinkPreviews,
  authorProfile,
  isEditing,
  editingContent,
  isActionBusy,
  reactionBusyKeys,
  messageReactionMap,
  messageAttachmentRows,
  messageLinkPreviewRow,
  getRenderableEmbedUrl,
  onStartEditingMessage,
  onEditingContentChange,
  onSaveEditedMessage,
  onCancelEditingMessage,
  onDeleteMessage,
  onReplyToMessage,
  onToggleReaction,
  onOpenMessageReport,
  onRefreshLinkPreview,
  onSaveAttachment,
  onReportUserProfile,
  onBanUser,
  onKickUser,
  onDirectMessageUser,
  onResolveBanEligibleServers,
}: MessageRowProps) {
  const isModerationPlaceholder = isModerationRemovedReplyPlaceholder(
    message as unknown as Message,
  );
  const isReply = depth > 0;
  const replyIndent = Math.min(depth, 4) * 20;

  if (isModerationPlaceholder) {
    return (
      <div
        className="flex gap-3"
        style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
      >
        <div className="min-w-0 flex-1 rounded-xl border border-dashed border-border bg-surface-panel px-4 py-3 text-sm italic text-muted-foreground">
          {BANNED_REPLY_PLACEHOLDER_CONTENT}
        </div>
      </div>
    );
  }

  const isStaffUserMessage = Boolean(message.isPlatformStaff);
  const isHiddenMessage = message.isHidden;
  const isOwnMessage = message.authorUserId === currentUserId;
  const canProfileMenu = Boolean(message.authorUserId);
  const kickDisabledReason =
    canManageMembers &&
    message.authorUserId !== currentUserId &&
    (isHiddenMessage || authorProfile?.username === "Banned User")
      ? "User is not a member"
      : null;
  const canDeleteMessage = isOwnMessage || canManageMessages;
  const canEditMessage = isOwnMessage;
  const authorLabel = getAuthorLabelForBundle(message, authorProfile, currentUserId);
  const authorColor = getAuthorColorForBundle(message, authorProfile, currentUserId);
  const reactionSummaries = Array.from(messageReactionMap.entries());
  const messageHasHttpUrl = messageContainsHttpUrl(message.content);
  const trimmedMessageContent = message.content.trim();
  const isInvisibleMediaPlaceholder = /^[\u200B\u200C\u200D\uFEFF]+$/.test(
    message.content,
  );
  const hideMediaPlaceholder =
    messageAttachmentRows.length > 0 &&
    (/^\[(media|image|file)\]$/i.test(trimmedMessageContent) ||
      isInvisibleMediaPlaceholder);

  const messageActions: MenuActionNode[] = [];

  if (canEditMessage) {
    messageActions.push({
      kind: "item",
      key: "edit",
      label: "Edit",
      onSelect: () => {
        onStartEditingMessage(message.id, message.content);
      },
    });
  }

  if (canDeleteMessage) {
    messageActions.push({
      kind: "item",
      key: "delete",
      label: "Delete",
      destructive: true,
      disabled: isActionBusy,
      onSelect: () => {
        onDeleteMessage(message.id);
      },
    });
  }

  if (messageActions.length > 0) {
    messageActions.push({ kind: "separator", key: "separator-edit-delete" });
  }

  messageActions.push({
    kind: "item",
    key: "reply",
    label: "Reply",
    onSelect: () =>
      onReplyToMessage({
        id: message.id,
        authorLabel,
        preview: message.content,
      }),
  });
  messageActions.push({
    kind: "separator",
    key: "separator-reply",
  });

  messageActions.push({
    kind: "submenu",
    key: "react-submenu",
    label: "React",
    items: QUICK_REACTION_EMOJI.map((emoji) => {
      const reactionKey = `${message.id}:${emoji}`;
      return {
        kind: "item",
        key: `react-${reactionKey}`,
        label: emoji,
        disabled: Boolean(reactionBusyKeys.current?.[reactionKey]),
        onSelect: () => {
          void onToggleReaction(message.id, emoji);
        },
      } satisfies MenuActionNode;
    }),
  });

  if (canRefreshLinkPreviews && messageHasHttpUrl) {
    const previewRefreshLabel =
      messageLinkPreviewRow?.status === "ready"
        ? "Refresh link preview"
        : messageLinkPreviewRow?.status === "pending"
          ? "Link preview pending"
          : "Generate link preview";

    messageActions.push({
      kind: "separator",
      key: "separator-link-preview-refresh",
    });
    messageActions.push({
      kind: "item",
      key: "refresh-link-preview",
      label: previewRefreshLabel,
      disabled: isActionBusy || messageLinkPreviewRow?.status === "pending",
      onSelect: () => {
        onRefreshLinkPreview(message.id);
      },
    });
  }

  if (messageAttachmentRows.length > 0) {
    messageActions.push({ kind: "separator", key: "separator-attachments" });
    messageActions.push({
      kind: "submenu",
      key: "save-media-submenu",
      label: "Save media",
      items: messageAttachmentRows.map((attachment) => {
        const attachmentLabel =
          attachment.originalFilename ??
          attachment.objectPath.split("/").pop() ??
          "media";
        return {
          kind: "item",
          key: `save-media-${attachment.id}`,
          label: attachmentLabel,
          onSelect: () => {
            onSaveAttachment(attachment);
          },
        } satisfies MenuActionNode;
      }),
    });
  }

  messageActions.push({ kind: "separator", key: "separator-report" });
  messageActions.push({
    kind: "item",
    key: "report",
    label: "Report",
    disabled: !canCreateReports,
    onSelect: () => {
      onOpenMessageReport(message.id);
    },
  });

  const authorAvatarInitial = authorLabel.trim().charAt(0).toUpperCase() || "U";
  const authorIdentity = (
    <div
      className={`flex items-center gap-2 min-w-0 ${canProfileMenu ? "cursor-pointer" : ""}`}
    >
      <Avatar size="sm">
        {authorProfile?.avatarUrl && (
          <AvatarImage src={authorProfile.avatarUrl} alt={authorLabel} />
        )}
        <AvatarFallback>{authorAvatarInitial}</AvatarFallback>
      </Avatar>
      <span
        className={`font-semibold text-[15px] truncate ${canProfileMenu ? "hover:underline underline-offset-2" : ""}`}
        style={{ color: authorColor }}
      >
        {authorLabel}
      </span>
    </div>
  );

  return (
    <ContextMenu
      onOpenChange={(nextOpen) => {
        traceContextMenuEvent("message", "open-change", {
          messageId: message.id,
          open: nextOpen,
        });
      }}
    >
      <ContextMenuTrigger
        asChild
        onContextMenu={(event) => {
          const intent = resolveContextMenuIntent(event.target);
          traceContextMenuEvent("message", "contextmenu-trigger", {
            messageId: message.id,
            intent,
          });

          if (intent === "entity_profile") {
            event.preventDefault();
            return;
          }

          if (intent === "native_text") {
            event.stopPropagation();
          }
        }}
      >
        <div
          data-menu-scope="message"
          className={`group rounded-md border px-3 py-2 transition-colors backdrop-blur-sm ${
            isHiddenMessage
              ? "bg-red-500/10 border-red-400/25 hover:bg-red-500/15 hover:border-red-300/35"
              : "bg-surface-message-row border-border-message-row hover:bg-surface-message-row-hover hover:border-border-message-row-hover"
          } ${isReply ? "border-l-2 border-l-border-reply-thread" : ""}`}
          style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              {canProfileMenu && message.authorUserId ? (
                <ProfileContextMenu
                  userId={message.authorUserId}
                  username={authorLabel}
                  avatarUrl={authorProfile?.avatarUrl ?? null}
                  canDirectMessage={message.authorUserId !== currentUserId}
                  canReport={
                    canCreateReports && message.authorUserId !== currentUserId
                  }
                  canBan={
                    canManageBans && message.authorUserId !== currentUserId
                  }
                  canKick={
                    canManageMembers && message.authorUserId !== currentUserId
                  }
                  kickDisabledReason={kickDisabledReason}
                  onDirectMessage={onDirectMessageUser}
                  onReport={onReportUserProfile}
                  onBan={onBanUser}
                  onKick={onKickUser}
                  resolveBanServers={onResolveBanEligibleServers}
                >
                  {authorIdentity}
                </ProfileContextMenu>
              ) : (
                authorIdentity
              )}
              {isStaffUserMessage && (
                <span className="px-1.5 py-0.5 rounded bg-link/20 text-link-bright text-[10px] font-semibold uppercase tracking-wide">
                  Staff
                </span>
              )}
              {isHiddenMessage && (
                <span className="rounded border border-red-300/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-100">
                  Hidden - banned user
                </span>
              )}
              <span className="text-xs text-placeholder-dim shrink-0">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <DropdownMenu
                onOpenChange={(nextOpen) => {
                  traceContextMenuEvent("message", "overflow-open-change", {
                    messageId: message.id,
                    open: nextOpen,
                  });
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-meta hover:text-white hover:bg-surface-hover"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-surface-legal border-border text-white"
                >
                  <ActionMenuContent
                    mode="dropdown"
                    scope="message"
                    actions={messageActions}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editingContent}
                onChange={(event) => onEditingContentChange(event.target.value)}
                className="bg-surface-panel border-border text-white"
                maxLength={4000}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onSaveEditedMessage(message.id, editingContent);
                  }}
                  disabled={isActionBusy}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onCancelEditingMessage}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!hideMediaPlaceholder && (
                <div className="text-foreground text-[15px] leading-[1.375] break-words">
                  <MarkdownText content={message.content} />
                </div>
              )}

              {messageLinkPreviewRow?.status === "pending" && (
                <div className="rounded-md border border-border bg-surface-panel px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Link preview
                  </p>
                  <p className="text-xs text-muted-foreground">Fetching preview...</p>
                </div>
              )}
              {messageLinkPreviewRow?.status === "ready" &&
                messageLinkPreviewRow.snapshot && (
                  <div className="space-y-2">
                    {messageLinkPreviewRow.snapshot.embed ? (
                      (() => {
                        const embedUrl = getRenderableEmbedUrl(
                          messageLinkPreviewRow,
                        );
                        if (!embedUrl) return null;

                        return (
                          <div className="space-y-2">
                            <div
                              className="overflow-hidden rounded-md border border-border bg-surface-desktop-shell"
                              style={{ maxWidth: "480px" }}
                            >
                              <div
                                className="bg-surface-desktop-shell"
                                style={{
                                  aspectRatio: String(
                                    messageLinkPreviewRow.snapshot.embed
                                      ?.aspectRatio || 16 / 9,
                                  ),
                                  maxWidth: "480px",
                                  width: "100%",
                                }}
                              >
                                <iframe
                                  src={embedUrl}
                                  title={
                                    messageLinkPreviewRow.snapshot.title ??
                                    "Embedded video"
                                  }
                                  className="h-full w-full max-h-64 max-w-lg aspect-video"
                                  loading="lazy"
                                  referrerPolicy="origin"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                              {(messageLinkPreviewRow.snapshot.title ||
                                messageLinkPreviewRow.snapshot.siteName ||
                                messageLinkPreviewRow.snapshot.description) && (
                                <a
                                  href={
                                    messageLinkPreviewRow.snapshot
                                      .canonicalUrl ??
                                    messageLinkPreviewRow.snapshot.sourceUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="block border-t border-border bg-surface-panel px-3 py-2 hover:bg-surface-embed-hover transition-colors"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {messageLinkPreviewRow.snapshot
                                      .siteName && (
                                      <span className="shrink-0 rounded-sm bg-surface-embed-chip px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-embed-chip">
                                        {
                                          messageLinkPreviewRow.snapshot
                                            .siteName
                                        }
                                      </span>
                                    )}
                                    {messageLinkPreviewRow.snapshot.title && (
                                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white leading-tight">
                                        {messageLinkPreviewRow.snapshot.title}
                                      </p>
                                    )}
                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                      Open
                                    </span>
                                  </div>
                                  {messageLinkPreviewRow.snapshot
                                    .description && (
                                    <p className="mt-1 text-xs text-embed-preview leading-snug max-h-8 overflow-hidden">
                                      {
                                        messageLinkPreviewRow.snapshot
                                          .description
                                      }
                                    </p>
                                  )}
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <a
                        href={
                          messageLinkPreviewRow.snapshot.canonicalUrl ??
                          messageLinkPreviewRow.snapshot.sourceUrl
                        }
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block rounded-md border border-border bg-surface-panel hover:bg-surface-attachment-hover transition-colors overflow-hidden"
                      >
                        {messageLinkPreviewRow.snapshot.thumbnail
                          ?.signedUrl && (
                          <img
                            src={
                              messageLinkPreviewRow.snapshot.thumbnail.signedUrl
                            }
                            alt={
                              messageLinkPreviewRow.snapshot.title ??
                              "Link preview"
                            }
                            className="w-full h-48 object-contain bg-surface-desktop-shell"
                          />
                        )}
                        <div className="px-3 py-2 space-y-1">
                          {messageLinkPreviewRow.snapshot.siteName && (
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {messageLinkPreviewRow.snapshot.siteName}
                            </p>
                          )}
                          {messageLinkPreviewRow.snapshot.title && (
                            <p className="text-sm font-semibold text-white leading-snug">
                              {messageLinkPreviewRow.snapshot.title}
                            </p>
                          )}
                          {messageLinkPreviewRow.snapshot.description && (
                            <p className="text-xs text-embed-preview leading-snug">
                              {messageLinkPreviewRow.snapshot.description}
                            </p>
                          )}
                        </div>
                      </a>
                    )}
                  </div>
                )}

              {messageAttachmentRows.length > 0 && (
                <div className="space-y-2">
                  {messageAttachmentRows.map((attachment) => {
                    const attachmentLabel =
                      attachment.originalFilename ??
                      attachment.objectPath.split("/").pop() ??
                      "media";
                    const expiresAtLabel = new Date(
                      attachment.expiresAt,
                    ).toLocaleString();

                    if (
                      attachment.mediaKind === "image" &&
                      attachment.signedUrl
                    ) {
                      return (
                        <div key={attachment.id} className="space-y-1">
                          <img
                            src={attachment.signedUrl}
                            alt={attachmentLabel}
                            className="max-h-64 rounded-md border border-border object-contain bg-surface-desktop-shell"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Expires {expiresAtLabel}
                          </p>
                        </div>
                      );
                    }

                    if (
                      attachment.mediaKind === "video" &&
                      attachment.signedUrl
                    ) {
                      return (
                        <div key={attachment.id} className="space-y-1">
                          <video
                            controls
                            src={attachment.signedUrl}
                            className="max-h-72 rounded-md border border-border bg-surface-desktop-shell"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Expires {expiresAtLabel}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div key={attachment.id} className="space-y-1">
                        {attachment.signedUrl ? (
                          <a
                            href={attachment.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-info hover:text-link-soft underline"
                          >
                            {attachmentLabel}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {attachmentLabel}
                          </span>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Expires {expiresAtLabel}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {reactionSummaries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {reactionSummaries.map(([emoji, summary]) => {
                    const reactionKey = `${message.id}:${emoji}`;
                    const isBusy = Boolean(
                      reactionBusyKeys.current?.[reactionKey],
                    );
                    return (
                      <Button
                        key={reactionKey}
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() => {
                          void onToggleReaction(message.id, emoji);
                        }}
                        className={`h-6 rounded-full border px-2 text-xs ${
                          summary.reactedByCurrentUser
                            ? "border-primary bg-primary/20 text-chip-selected"
                            : "border-border bg-surface-panel text-chip-muted hover:text-white"
                        }`}
                      >
                        <span>{emoji}</span>
                        <span>{summary.count}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-surface-legal border-border text-white">
        <ActionMenuContent
          mode="context"
          scope="message"
          actions={messageActions}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}, areMessageRowPropsEqual);

const MessageTreeItem = React.memo(function MessageTreeItem({
  message,
  depth,
  ancestorPath,
  currentUserId,
  canManageMessages,
  canCreateReports,
  canManageBans,
  canManageMembers,
  canRefreshLinkPreviews,
  editingMessageId,
  activeEditingContent,
  actionBusyMessageId,
  reactionBusyKeys,
  expandedReplyThreads,
  repliesByParentId,
  attachmentsByMessageId,
  linkPreviewByMessageId,
  reactionsByMessageId,
  authorProfilesByMessageId,
  getRenderableEmbedUrl,
  onStartEditingMessage,
  onEditingContentChange,
  onSaveEditedMessage,
  onCancelEditingMessage,
  onDeleteMessage,
  onReplyToMessage,
  onToggleReaction,
  onOpenMessageReport,
  onRefreshLinkPreview,
  onSaveAttachment,
  onReportUserProfile,
  onBanUser,
  onKickUser,
  onDirectMessageUser,
  onResolveBanEligibleServers,
  onReplyThreadOpenChange,
}: MessageTreeItemProps) {
  const replies = repliesByParentId.get(message.id) ?? EMPTY_REPLY_MESSAGES;
  const repliesExpanded = Boolean(expandedReplyThreads[message.id]);
  const nextAncestorPath = `${ancestorPath}${ANCESTOR_PATH_SEPARATOR}${message.id}${ANCESTOR_PATH_SEPARATOR}`;
  const renderableReplies = useMemo(
    () =>
      replies.filter(
        (reply) =>
          !nextAncestorPath.includes(
            `${ANCESTOR_PATH_SEPARATOR}${reply.id}${ANCESTOR_PATH_SEPARATOR}`,
          ),
      ),
    [nextAncestorPath, replies],
  );
  const authorProfile = authorProfilesByMessageId.get(message.id);
  const messageReactionMap =
    reactionsByMessageId.get(message.id) ?? EMPTY_MESSAGE_REACTION_MAP;
  const messageAttachmentRows =
    attachmentsByMessageId.get(message.id) ?? EMPTY_MESSAGE_ATTACHMENTS;
  const messageLinkPreviewRow = linkPreviewByMessageId.get(message.id) ?? null;
  const isEditing = editingMessageId === message.id;
  const editingContent = isEditing ? activeEditingContent : "";
  const isActionBusy = actionBusyMessageId === message.id;

  return (
    <Collapsible
      open={repliesExpanded}
      onOpenChange={(nextOpen) => {
        onReplyThreadOpenChange(message.id, nextOpen);
      }}
      className="space-y-2"
    >
      <MessageRow
        message={message}
        depth={depth}
        currentUserId={currentUserId}
        canManageMessages={canManageMessages}
        canCreateReports={canCreateReports}
        canManageBans={canManageBans}
        canManageMembers={canManageMembers}
        canRefreshLinkPreviews={canRefreshLinkPreviews}
        authorProfile={authorProfile}
        isEditing={isEditing}
        editingContent={editingContent}
        isActionBusy={isActionBusy}
        reactionBusyKeys={reactionBusyKeys}
        messageReactionMap={messageReactionMap}
        messageAttachmentRows={messageAttachmentRows}
        messageLinkPreviewRow={messageLinkPreviewRow}
        getRenderableEmbedUrl={getRenderableEmbedUrl}
        onStartEditingMessage={onStartEditingMessage}
        onEditingContentChange={onEditingContentChange}
        onSaveEditedMessage={onSaveEditedMessage}
        onCancelEditingMessage={onCancelEditingMessage}
        onDeleteMessage={onDeleteMessage}
        onReplyToMessage={onReplyToMessage}
        onToggleReaction={onToggleReaction}
        onOpenMessageReport={onOpenMessageReport}
        onRefreshLinkPreview={onRefreshLinkPreview}
        onSaveAttachment={onSaveAttachment}
        onReportUserProfile={onReportUserProfile}
        onBanUser={onBanUser}
        onKickUser={onKickUser}
        onDirectMessageUser={onDirectMessageUser}
        onResolveBanEligibleServers={onResolveBanEligibleServers}
      />

      {renderableReplies.length > 0 && (
        <div className="ml-1">
          <CollapsibleTrigger
            type="button"
            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground gpu-layer transition-colors hover:bg-surface-hover hover:text-white focus-visible:ring-2 focus-visible:ring-border-selected focus-visible:outline-none"
          >
            {repliesExpanded
              ? `Hide replies (${renderableReplies.length})`
              : `View replies (${renderableReplies.length})`}
          </CollapsibleTrigger>
        </div>
      )}

      {renderableReplies.length > 0 && (
        <CollapsibleContent className="space-y-2">
          {renderableReplies.map((reply) => (
            <MessageTreeItem
              key={reply.id}
              message={reply}
              depth={depth + 1}
              ancestorPath={nextAncestorPath}
              currentUserId={currentUserId}
              canManageMessages={canManageMessages}
              canCreateReports={canCreateReports}
              canManageBans={canManageBans}
              canManageMembers={canManageMembers}
              canRefreshLinkPreviews={canRefreshLinkPreviews}
              editingMessageId={editingMessageId}
              activeEditingContent={activeEditingContent}
              actionBusyMessageId={actionBusyMessageId}
              reactionBusyKeys={reactionBusyKeys}
              expandedReplyThreads={expandedReplyThreads}
              repliesByParentId={repliesByParentId}
              attachmentsByMessageId={attachmentsByMessageId}
              linkPreviewByMessageId={linkPreviewByMessageId}
              reactionsByMessageId={reactionsByMessageId}
              authorProfilesByMessageId={authorProfilesByMessageId}
              getRenderableEmbedUrl={getRenderableEmbedUrl}
              onStartEditingMessage={onStartEditingMessage}
              onEditingContentChange={onEditingContentChange}
              onSaveEditedMessage={onSaveEditedMessage}
              onCancelEditingMessage={onCancelEditingMessage}
              onDeleteMessage={onDeleteMessage}
              onReplyToMessage={onReplyToMessage}
              onToggleReaction={onToggleReaction}
              onOpenMessageReport={onOpenMessageReport}
              onRefreshLinkPreview={onRefreshLinkPreview}
              onSaveAttachment={onSaveAttachment}
              onReportUserProfile={onReportUserProfile}
              onBanUser={onBanUser}
              onKickUser={onKickUser}
              onDirectMessageUser={onDirectMessageUser}
              onResolveBanEligibleServers={onResolveBanEligibleServers}
              onReplyThreadOpenChange={onReplyThreadOpenChange}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
});

const MessageVirtuosoItem = React.memo(function MessageVirtuosoItem({
  message,
  ...sharedProps
}: MessageVirtuosoItemProps) {
  return (
    <div className="px-4 pb-4">
      <MessageTreeItem
        {...sharedProps}
        message={message}
        depth={0}
        ancestorPath=""
      />
    </div>
  );
});

export function MessageList({
  channelId,
  messages,
  currentUserId,
  canManageMessages,
  canCreateReports,
  canManageBans,
  canManageMembers,
  canRefreshLinkPreviews,
  onSaveAttachment,
  onReportUserProfile,
  onBanUserFromServer,
  onKickUserFromCurrentServer,
  onResolveBanEligibleServers,
  onDirectMessageUser,
  onDeleteMessage,
  onEditMessage,
  onToggleMessageReaction,
  onReplyToMessage,
  onReportMessage,
  onRequestMessageLinkPreviewRefresh,
  onRequestOlderMessages,
  hasOlderMessages = false,
  isLoadingOlderMessages = false,
  bottomInset = 96,
}: MessageListProps) {
  const core = useHavenCore();
  const liveProfiles = core.profiles.useProfilesRecord();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const isAtBottomRef = useRef(true);
  const previousChannelIdRef = useRef(channelId);
  const previousRootMessageIdsRef = useRef<string[]>([]);
  const olderLoadInFlightRef = useRef(false);
  const shouldScrollToBottomOnNextDataRef = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(1_000_000);
  const [expandedReplyThreads, setExpandedReplyThreads] = useState<
    Record<string, boolean>
  >({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusyMessageId, setActionBusyMessageId] = useState<string | null>(
    null,
  );
  const [reactionBusyKeys, setReactionBusyKeys] = useState<
    Record<string, boolean>
  >({});
  const reactionBusyKeysRef = useRef<Record<string, boolean>>({});
  const [reportDialogMessageId, setReportDialogMessageId] = useState<
    string | null
  >(null);
  const [reportTarget, setReportTarget] =
    useState<MessageReportTarget>("haven_staff");
  const [reportKind, setReportKind] =
    useState<MessageReportKind>("content_abuse");
  const [reportComment, setReportComment] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [profileReportDraft, setProfileReportDraft] = useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [profileReportReason, setProfileReportReason] = useState("");
  const [profileReportSubmitting, setProfileReportSubmitting] = useState(false);
  const [banDraft, setBanDraft] = useState<{
    targetUserId: string;
    communityId: string;
    username: string;
  } | null>(null);
  const [kickDraft, setKickDraft] = useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = useState(false);
  const [kickSubmitting, setKickSubmitting] = useState(false);

  const messageById = useMemo(() => {
    const next = new Map<string, MessageBundle>();
    for (const bundle of messages) {
      next.set(bundle.id, bundle);
    }
    return next;
  }, [messages]);

  const attachmentsByMessageId = useMemo(() => {
    const next = new Map<string, MessageAttachment[]>();
    for (const bundle of messages) {
      next.set(
        bundle.id,
        bundle.attachment
          ? [bundle.attachment]
          : [...EMPTY_MESSAGE_ATTACHMENTS],
      );
    }
    return next;
  }, [messages]);

  const linkPreviewByMessageId = useMemo(() => {
    const next = new Map<string, MessageLinkPreview>();
    for (const bundle of messages) {
      if (bundle.linkPreview) {
        next.set(bundle.id, bundle.linkPreview);
      }
    }
    return next;
  }, [messages]);

  const getRenderableEmbedUrl = React.useCallback(
    (preview: MessageLinkPreview): string | null => {
      const embed = preview.snapshot?.embed;
      if (!embed?.embedUrl) return null;

      try {
        const url = new URL(embed.embedUrl);
        if (
          embed.provider === "youtube" &&
          url.hostname.toLowerCase() === "www.youtube.com"
        ) {
          url.hostname = "www.youtube-nocookie.com";
        }
        if (
          embed.provider === "youtube" &&
          !url.pathname.startsWith("/embed/")
        ) {
          return getFallbackEmbedUrl(preview);
        }
        if (embed.provider === "vimeo" && !url.pathname.startsWith("/video/")) {
          return getFallbackEmbedUrl(preview);
        }
        return url.toString();
      } catch {
        return getFallbackEmbedUrl(preview) ?? embed.embedUrl;
      }
    },
    [],
  );

  const reactionsByMessageId = useMemo(() => {
    const next = new Map<
      string,
      Map<string, { count: number; reactedByCurrentUser: boolean }>
    >();
    for (const bundle of messages) {
      for (const reaction of bundle.reactions) {
        const byEmoji =
          next.get(bundle.id) ??
          new Map<string, { count: number; reactedByCurrentUser: boolean }>();
        const current = byEmoji.get(reaction.emoji) ?? {
          count: 0,
          reactedByCurrentUser: false,
        };
        current.count += 1;
        if (reaction.userId === currentUserId) {
          current.reactedByCurrentUser = true;
        }
        byEmoji.set(reaction.emoji, current);
        next.set(bundle.id, byEmoji);
      }
    }
    return next;
  }, [currentUserId, messages]);

  const replyTree = useMemo(() => {
    const repliesByParentId = new Map<string, MessageBundle[]>();
    const rootMessages: MessageBundle[] = [];

    for (const message of messages) {
      const parentId = getReplyToMessageIdFromBundle(message);
      const parentExists = Boolean(
        parentId && parentId !== message.id && messageById.has(parentId),
      );

      if (!parentExists || !parentId) {
        rootMessages.push(message);
        continue;
      }

      const existing = repliesByParentId.get(parentId) ?? [];
      existing.push(message);
      repliesByParentId.set(parentId, existing);
    }

    if (rootMessages.length === 0 && messages.length > 0) {
      return {
        rootMessages: messages,
        repliesByParentId: new Map<string, MessageBundle[]>(),
      };
    }

    return { rootMessages, repliesByParentId };
  }, [messageById, messages]);

  useEffect(() => {
    const validThreadParentIds = new Set(replyTree.repliesByParentId.keys());

    setExpandedReplyThreads((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [messageId, isExpanded] of Object.entries(prev)) {
        if (!validThreadParentIds.has(messageId)) {
          changed = true;
          continue;
        }
        next[messageId] = isExpanded;
      }

      return changed ? next : prev;
    });
  }, [replyTree]);

  useEffect(() => {
    previousChannelIdRef.current = channelId;
    previousRootMessageIdsRef.current = [];
    olderLoadInFlightRef.current = false;
    isAtBottomRef.current = true;
    shouldScrollToBottomOnNextDataRef.current = true;
    setFirstItemIndex(1_000_000);
  }, [channelId]);

  useEffect(() => {
    const nextRootMessageIds = replyTree.rootMessages.map(
      (message) => message.id,
    );
    const previousRootMessageIds = previousRootMessageIdsRef.current;

    if (
      previousRootMessageIds.length > 0 &&
      nextRootMessageIds.length > previousRootMessageIds.length
    ) {
      const previousIsSuffix = previousRootMessageIds.every(
        (messageId, index) => {
          const nextIndex =
            nextRootMessageIds.length - previousRootMessageIds.length + index;
          return nextRootMessageIds[nextIndex] === messageId;
        },
      );

      if (previousIsSuffix) {
        setFirstItemIndex(
          (prev) =>
            prev - (nextRootMessageIds.length - previousRootMessageIds.length),
        );
      }
    }

    previousRootMessageIdsRef.current = nextRootMessageIds;
  }, [replyTree.rootMessages]);

  useEffect(() => {
    if (!editingMessageId || messageById.has(editingMessageId)) return;
    setEditingMessageId(null);
    setEditingContent("");
  }, [editingMessageId, messageById]);

  useEffect(() => {
    if (!actionBusyMessageId || messageById.has(actionBusyMessageId)) return;
    setActionBusyMessageId(null);
  }, [actionBusyMessageId, messageById]);

  useEffect(() => {
    if (!reportDialogMessageId || messageById.has(reportDialogMessageId))
      return;
    setReportDialogMessageId(null);
    setReportSubmitting(false);
  }, [messageById, reportDialogMessageId]);

  useEffect(() => {
    setExpandedReplyThreads({});
    setEditingMessageId(null);
    setEditingContent("");
    setActionBusyMessageId(null);
    setReactionBusyKeys({});
    setReportDialogMessageId(null);
    setReportSubmitting(false);
    setProfileReportDraft(null);
    setProfileReportReason("");
    setProfileReportSubmitting(false);
    setBanDraft(null);
    setBanReason("");
    setBanSubmitting(false);
    setBanConfirmOpen(false);
    setActionError(null);
  }, [channelId]);

  useEffect(() => {
    if (!actionError) return;
    const timeoutId = window.setTimeout(() => {
      setActionError(null);
    }, 6000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionError]);

  useEffect(() => {
    setReactionBusyKeys((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [key, isBusy] of Object.entries(prev)) {
        const separatorIndex = key.indexOf(":");
        const messageId =
          separatorIndex > 0 ? key.slice(0, separatorIndex) : key;
        if (!messageById.has(messageId)) {
          changed = true;
          continue;
        }
        next[key] = isBusy;
      }

      return changed ? next : prev;
    });
  }, [messageById]);

  useEffect(() => {
    reactionBusyKeysRef.current = reactionBusyKeys;
  }, [reactionBusyKeys]);

  const toggleReaction = React.useCallback(
    async (messageId: string, emoji: string) => {
      const reactionKey = `${messageId}:${emoji}`;
      if (reactionBusyKeysRef.current[reactionKey]) return;

      setReactionBusyKeys((prev) => ({ ...prev, [reactionKey]: true }));
      setActionError(null);

      try {
        await onToggleMessageReaction(messageId, emoji);
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, "Failed to update reaction."));
      } finally {
        setReactionBusyKeys((prev) => {
          const { [reactionKey]: _removed, ...rest } = prev;
          return rest;
        });
      }
    },
    [onToggleMessageReaction],
  );

  const getResolvedAuthorProfileForBundle = React.useCallback(
    (bundle: MessageBundle): AuthorProfile | undefined => {
      const targetUserId = bundle.authorUserId;
      if (!targetUserId) return undefined;

      const liveProfile = getLiveProfile(liveProfiles, targetUserId);
      const baseUsername =
        liveProfile?.username ??
        bundle.displayName ??
        targetUserId.substring(0, 12);
      const baseAvatar =
        liveProfile?.avatarUrl ?? bundle.avatarSnapshotUrl ?? null;
      const synthetic: AuthorProfile = {
        username: baseUsername,
        isPlatformStaff: bundle.isPlatformStaff,
        displayPrefix: null,
        avatarUrl: baseAvatar,
      };
      const preserveFetchedTombstone = isAuthorProfileTombstone(synthetic);

      return {
        username:
          (preserveFetchedTombstone ? null : liveProfile?.username) ??
          bundle.displayName ??
          targetUserId.substring(0, 12),
        isPlatformStaff: bundle.isPlatformStaff,
        displayPrefix: null,
        avatarUrl:
          (preserveFetchedTombstone ? null : liveProfile?.avatarUrl) ??
          bundle.avatarSnapshotUrl ??
          null,
      };
    },
    [liveProfiles],
  );

  const getResolvedAuthorProfileForUserId = React.useCallback(
    (targetUserId: string | null | undefined): AuthorProfile | undefined => {
      if (!targetUserId) return undefined;
      const bundle = messages.find(
        (b) => b.authorUserId === targetUserId,
      );
      if (bundle) return getResolvedAuthorProfileForBundle(bundle);
      const liveProfile = getLiveProfile(liveProfiles, targetUserId);
      if (!liveProfile) return undefined;
      return {
        username: liveProfile.username ?? targetUserId.substring(0, 12),
        isPlatformStaff: false,
        displayPrefix: null,
        avatarUrl: liveProfile.avatarUrl ?? null,
      };
    },
    [getResolvedAuthorProfileForBundle, liveProfiles, messages],
  );

  const authorProfilesByMessageId = useMemo(() => {
    const next = new Map<string, AuthorProfile | undefined>();
    for (const bundle of messages) {
      next.set(bundle.id, getResolvedAuthorProfileForBundle(bundle));
    }
    return next;
  }, [getResolvedAuthorProfileForBundle, messages]);

  const reportProfile = React.useCallback(
    async (targetUserId: string) => {
      if (!canCreateReports) {
        setActionError(
          "You do not have permission to report profiles in this server.",
        );
        return;
      }
      const profile = getResolvedAuthorProfileForUserId(targetUserId);
      setProfileReportDraft({
        targetUserId,
        username: profile?.username ?? targetUserId.substring(0, 12),
      });
      setProfileReportReason("");
      setProfileReportSubmitting(false);
      setActionError(null);
    },
    [canCreateReports, getResolvedAuthorProfileForUserId],
  );

  const openBanDialog = React.useCallback(
    (targetUserId: string, communityId: string) => {
      const profile = getResolvedAuthorProfileForUserId(targetUserId);
      const username = profile?.username ?? targetUserId.substring(0, 12);
      setBanDraft({
        targetUserId,
        communityId,
        username,
      });
      setBanReason("");
      setBanSubmitting(false);
      setBanConfirmOpen(false);
      setActionError(null);
    },
    [getResolvedAuthorProfileForUserId],
  );

  const openKickDialog = React.useCallback(
    (targetUserId: string) => {
      const profile = getResolvedAuthorProfileForUserId(targetUserId);
      const username = profile?.username ?? targetUserId.substring(0, 12);
      setKickDraft({
        targetUserId,
        username,
      });
      setKickSubmitting(false);
      setActionError(null);
    },
    [getResolvedAuthorProfileForUserId],
  );

  const handleStartEditingMessage = React.useCallback(
    (messageId: string, content: string) => {
      setActionError(null);
      setEditingMessageId(messageId);
      setEditingContent(content);
    },
    [],
  );

  const handleEditingContentChange = React.useCallback((content: string) => {
    setEditingContent(content);
  }, []);

  const handleSaveEditedMessage = React.useCallback(
    (messageId: string, content: string) => {
      const nextContent = content.trim();
      if (!nextContent) {
        setActionError("Message content is required.");
        return;
      }

      setActionBusyMessageId(messageId);
      void onEditMessage(messageId, nextContent)
        .then(() => {
          setEditingMessageId(null);
          setEditingContent("");
        })
        .catch((error: unknown) => {
          setActionError(getErrorMessage(error, "Failed to edit message."));
        })
        .finally(() => {
          setActionBusyMessageId((prev) => (prev === messageId ? null : prev));
        });
    },
    [onEditMessage],
  );

  const handleCancelEditingMessage = React.useCallback(() => {
    setEditingMessageId(null);
    setEditingContent("");
  }, []);

  const handleDeleteMessage = React.useCallback(
    (messageId: string) => {
      setActionError(null);
      setActionBusyMessageId(messageId);
      void onDeleteMessage(messageId)
        .catch((error: unknown) => {
          setActionError(getErrorMessage(error, "Failed to delete message."));
        })
        .finally(() => {
          setActionBusyMessageId((prev) => (prev === messageId ? null : prev));
        });
    },
    [onDeleteMessage],
  );

  const handleReplyToMessage = React.useCallback(
    (target: { id: string; authorLabel: string; preview: string }) => {
      onReplyToMessage(target);
    },
    [onReplyToMessage],
  );

  const handleRefreshLinkPreview = React.useCallback(
    (messageId: string) => {
      setActionError(null);
      setActionBusyMessageId(messageId);
      void onRequestMessageLinkPreviewRefresh(messageId)
        .catch((error: unknown) => {
          setActionError(
            getErrorMessage(error, "Failed to refresh link preview."),
          );
        })
        .finally(() => {
          setActionBusyMessageId((prev) => (prev === messageId ? null : prev));
        });
    },
    [onRequestMessageLinkPreviewRefresh],
  );

  const handleSaveAttachment = React.useCallback(
    (attachment: MessageAttachment) => {
      void onSaveAttachment(attachment).catch((error: unknown) => {
        setActionError(getErrorMessage(error, "Failed to save media."));
      });
    },
    [onSaveAttachment],
  );

  const handleOpenMessageReport = React.useCallback((messageId: string) => {
    setReportDialogMessageId(messageId);
    setReportTarget("haven_staff");
    setReportKind("content_abuse");
    setReportComment("");
    setActionError(null);
  }, []);

  const handleReportProfile = React.useCallback(
    (targetUserId: string) => {
      void reportProfile(targetUserId);
    },
    [reportProfile],
  );

  const handleBanUser = React.useCallback(
    (targetUserId: string, communityId: string) => {
      openBanDialog(targetUserId, communityId);
    },
    [openBanDialog],
  );

  const handleKickUser = React.useCallback(
    (targetUserId: string) => {
      openKickDialog(targetUserId);
    },
    [openKickDialog],
  );

  const handleDirectMessageUser = React.useCallback(
    (targetUserId: string) => {
      onDirectMessageUser(targetUserId);
    },
    [onDirectMessageUser],
  );

  const handleResolveBanEligibleServers = React.useCallback(
    (targetUserId: string) => onResolveBanEligibleServers(targetUserId),
    [onResolveBanEligibleServers],
  );

  const handleReplyThreadOpenChange = React.useCallback(
    (messageId: string, nextOpen: boolean) => {
      setExpandedReplyThreads((prev) => ({
        ...prev,
        [messageId]: nextOpen,
      }));
    },
    [],
  );

  const messageTreeSharedProps = useMemo<MessageTreeSharedProps>(
    () => ({
      currentUserId,
      canManageMessages,
      canCreateReports,
      canManageBans,
      canManageMembers,
      canRefreshLinkPreviews,
      editingMessageId,
      activeEditingContent: editingContent,
      actionBusyMessageId,
      reactionBusyKeys: reactionBusyKeysRef,
      expandedReplyThreads,
      repliesByParentId: replyTree.repliesByParentId,
      attachmentsByMessageId,
      linkPreviewByMessageId,
      reactionsByMessageId,
      authorProfilesByMessageId,
      getRenderableEmbedUrl,
      onStartEditingMessage: handleStartEditingMessage,
      onEditingContentChange: handleEditingContentChange,
      onSaveEditedMessage: handleSaveEditedMessage,
      onCancelEditingMessage: handleCancelEditingMessage,
      onDeleteMessage: handleDeleteMessage,
      onReplyToMessage: handleReplyToMessage,
      onToggleReaction: toggleReaction,
      onOpenMessageReport: handleOpenMessageReport,
      onRefreshLinkPreview: handleRefreshLinkPreview,
      onSaveAttachment: handleSaveAttachment,
      onReportUserProfile: handleReportProfile,
      onBanUser: handleBanUser,
      onKickUser: handleKickUser,
      onDirectMessageUser: handleDirectMessageUser,
      onResolveBanEligibleServers: handleResolveBanEligibleServers,
      onReplyThreadOpenChange: handleReplyThreadOpenChange,
    }),
    [
      actionBusyMessageId,
      attachmentsByMessageId,
      authorProfilesByMessageId,
      canCreateReports,
      canManageBans,
      canManageMembers,
      canManageMessages,
      canRefreshLinkPreviews,
      currentUserId,
      editingContent,
      editingMessageId,
      expandedReplyThreads,
      getRenderableEmbedUrl,
      handleBanUser,
      handleCancelEditingMessage,
      handleDeleteMessage,
      handleDirectMessageUser,
      handleEditingContentChange,
      handleKickUser,
      handleOpenMessageReport,
      handleRefreshLinkPreview,
      handleReplyThreadOpenChange,
      handleReplyToMessage,
      handleReportProfile,
      handleResolveBanEligibleServers,
      handleSaveAttachment,
      handleSaveEditedMessage,
      handleStartEditingMessage,
      linkPreviewByMessageId,
      reactionsByMessageId,
      replyTree.repliesByParentId,
      toggleReaction,
    ],
  );

  const renderVirtuosoItem = React.useCallback(
    (_index: number, message: MessageBundle) => (
      <MessageVirtuosoItem {...messageTreeSharedProps} message={message} />
    ),
    [messageTreeSharedProps],
  );

  const computeItemKey = React.useCallback(
    (_index: number, message: MessageBundle) => message.id,
    [],
  );

  const handleAtBottomStateChange = React.useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
  }, []);

  const handleFollowOutput = React.useCallback((isAtBottom: boolean) => {
    if (shouldScrollToBottomOnNextDataRef.current) return "auto";
    return isAtBottom ? "smooth" : false;
  }, []);

  const renderOlderMessagesHeader = React.useCallback(
    () =>
      isLoadingOlderMessages || hasOlderMessages ? (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-center">
            <div className="rounded-full border border-border bg-surface-panel px-3 py-1 text-[11px] text-composer-hint">
              {isLoadingOlderMessages
                ? "Loading older messages..."
                : "Scroll up to load older messages"}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-4" />
      ),
    [hasOlderMessages, isLoadingOlderMessages],
  );

  const renderBottomInsetFooter = React.useCallback(
    () => <div style={{ height: `${Math.max(16, bottomInset)}px` }} />,
    [bottomInset],
  );

  const virtuosoComponents = useMemo(
    () => ({
      Header: renderOlderMessagesHeader,
      Footer: renderBottomInsetFooter,
    }),
    [renderBottomInsetFooter, renderOlderMessagesHeader],
  );

  useEffect(() => {
    if (replyTree.rootMessages.length === 0) return;
    if (!shouldScrollToBottomOnNextDataRef.current) return;
    void Promise.resolve().then(() => {
      if (!virtuosoRef.current) return;
      virtuosoRef.current.scrollToIndex({
        index: replyTree.rootMessages.length - 1,
        align: "end",
        behavior: "auto",
      });
      shouldScrollToBottomOnNextDataRef.current = false;
    });
  }, [channelId, replyTree.rootMessages.length]);

  const handleStartReached = React.useCallback(() => {
    if (!hasOlderMessages || isLoadingOlderMessages) return;
    if (!onRequestOlderMessages) return;
    if (olderLoadInFlightRef.current) return;

    olderLoadInFlightRef.current = true;
    void onRequestOlderMessages().finally(() => {
      olderLoadInFlightRef.current = false;
    });
  }, [hasOlderMessages, isLoadingOlderMessages, onRequestOlderMessages]);

  return (
    <>
      <div className="flex-1 min-h-0">
        <Virtuoso
          ref={virtuosoRef}
          className="h-full"
          data={replyTree.rootMessages}
          firstItemIndex={firstItemIndex}
          computeItemKey={computeItemKey}
          atBottomStateChange={handleAtBottomStateChange}
          followOutput={handleFollowOutput}
          startReached={handleStartReached}
          increaseViewportBy={{ top: 800, bottom: 1200 }}
          components={virtuosoComponents}
          itemContent={renderVirtuosoItem}
        />
      </div>

      <Dialog
        open={Boolean(profileReportDraft)}
        onOpenChange={(open) => {
          if (open) return;
          setProfileReportDraft(null);
          setProfileReportReason("");
          setProfileReportSubmitting(false);
        }}
      >
        <DialogContent className="bg-surface-legal border-border text-white">
          <DialogHeader>
            <DialogTitle>Report Profile</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Send a profile report to moderators for review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-settings-body">
              Target:{" "}
              <span className="font-semibold text-white">
                {profileReportDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (required)
            </label>
            <Textarea
              value={profileReportReason}
              onChange={(event) => setProfileReportReason(event.target.value)}
              maxLength={1000}
              className="bg-surface-panel border-border text-white"
              placeholder="Describe why this profile should be reviewed."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setProfileReportDraft(null);
                setProfileReportReason("");
                setProfileReportSubmitting(false);
              }}
              disabled={profileReportSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!profileReportDraft) return;

                const normalizedReason = profileReportReason.trim();
                if (!normalizedReason) {
                  setActionError("Report reason is required.");
                  return;
                }

                setProfileReportSubmitting(true);
                setActionError(null);
                void onReportUserProfile({
                  targetUserId: profileReportDraft.targetUserId,
                  reason: normalizedReason,
                })
                  .then(() => {
                    setProfileReportDraft(null);
                    setProfileReportReason("");
                  })
                  .catch((error: unknown) => {
                    setActionError(
                      getErrorMessage(
                        error,
                        "Failed to submit profile report.",
                      ),
                    );
                  })
                  .finally(() => {
                    setProfileReportSubmitting(false);
                  });
              }}
              disabled={profileReportSubmitting}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {profileReportSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reportDialogMessageId)}
        onOpenChange={(open) => !open && setReportDialogMessageId(null)}
      >
        <DialogContent className="bg-surface-legal border-border text-white">
          <DialogHeader>
            <DialogTitle>Report Message</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Route this report to server staff, the Haven Moderation Team, or
              both while preserving a snapshot of the current context.
            </DialogDescription>

          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Destination
              </label>
              <select
                value={reportTarget}
                onChange={(event) =>
                  setReportTarget(event.target.value as MessageReportTarget)
                }
                className="w-full rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-white"
              >
                <option value="haven_staff">Haven Moderation Team</option>
                <option value="server_admins">Server Staff</option>
                <option value="both">Both</option>
              </select>

            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Type
              </label>
              <select
                value={reportKind}
                onChange={(event) =>
                  setReportKind(event.target.value as MessageReportKind)
                }
                className="w-full rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-white"
              >
                <option value="content_abuse">Report Content Abuse</option>
                <option value="bug">Report Bug</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Comment
              </label>
              <Textarea
                value={reportComment}
                onChange={(event) => setReportComment(event.target.value)}
                maxLength={1000}
                className="bg-surface-panel border-border text-white"
                placeholder="Add context for moderators (optional)."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReportDialogMessageId(null)}
              disabled={reportSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!reportDialogMessageId || reportSubmitting}
              onClick={() => {
                if (!reportDialogMessageId) return;
                setReportSubmitting(true);
                setActionError(null);
                void onReportMessage({
                  messageId: reportDialogMessageId,
                  target: reportTarget,
                  kind: reportKind,
                  comment: reportComment.trim(),
                })
                  .then(() => {
                    setReportDialogMessageId(null);
                  })
                  .catch((error: unknown) => {
                    setActionError(
                      getErrorMessage(
                        error,
                        "Failed to submit message report.",
                      ),
                    );
                  })
                  .finally(() => {
                    setReportSubmitting(false);
                  });
              }}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {reportSubmitting ? "Submitting..." : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(banDraft)}
        onOpenChange={(open) => {
          if (open) return;
          setBanDraft(null);
          setBanReason("");
          setBanSubmitting(false);
          setBanConfirmOpen(false);
        }}
      >
        <DialogContent className="bg-surface-legal border-border text-white">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Bans remove server access immediately and block rejoin until
              unbanned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-settings-body">
              Target:{" "}
              <span className="font-semibold text-white">
                {banDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason (required)
            </label>
            <Textarea
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              maxLength={1000}
              className="bg-surface-panel border-border text-white"
              placeholder="Describe why this user is being banned."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBanDraft(null);
                setBanReason("");
                setBanSubmitting(false);
                setBanConfirmOpen(false);
              }}
              disabled={banSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!banReason.trim()) {
                  setActionError("Ban reason is required.");
                  return;
                }
                setBanConfirmOpen(true);
              }}
              disabled={banSubmitting || !banDraft}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={banConfirmOpen} onOpenChange={setBanConfirmOpen}>
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ban</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action is immediate. Confirm banning this user from the
              selected server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={banSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={banSubmitting || !banDraft}
              onClick={() => {
                if (!banDraft) return;
                const normalizedReason = banReason.trim();
                if (!normalizedReason) {
                  setActionError("Ban reason is required.");
                  return;
                }
                setBanSubmitting(true);
                setActionError(null);
                void onBanUserFromServer({
                  targetUserId: banDraft.targetUserId,
                  communityId: banDraft.communityId,
                  reason: normalizedReason,
                })
                  .then(() => {
                    setBanConfirmOpen(false);
                    setBanDraft(null);
                    setBanReason("");
                  })
                  .catch((error: unknown) => {
                    setActionError(
                      getErrorMessage(error, "Failed to ban user."),
                    );
                  })
                  .finally(() => {
                    setBanSubmitting(false);
                  });
              }}
            >
              {banSubmitting ? "Banning..." : "Ban User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(kickDraft)}
        onOpenChange={(open) => {
          if (open) return;
          setKickDraft(null);
          setKickSubmitting(false);
        }}
      >
        <AlertDialogContent className="bg-surface-legal border-border text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Remove this user from the server now. They can rejoin later if
              they still have a valid invite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kickSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={kickSubmitting || !kickDraft}
              onClick={() => {
                if (!kickDraft) return;
                setKickSubmitting(true);
                setActionError(null);
                void onKickUserFromCurrentServer({
                  targetUserId: kickDraft.targetUserId,
                  username: kickDraft.username,
                })
                  .then(() => {
                    setKickDraft(null);
                  })
                  .catch((error: unknown) => {
                    setActionError(
                      getErrorMessage(
                        error,
                        "Failed to remove user from the server.",
                      ),
                    );
                  })
                  .finally(() => {
                    setKickSubmitting(false);
                  });
              }}
            >
              {kickSubmitting ? "Removing..." : "Remove from Server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {actionError && (
        <p className="px-4 pb-2 text-xs text-red-400">{actionError}</p>
      )}
    </>
  );
}
