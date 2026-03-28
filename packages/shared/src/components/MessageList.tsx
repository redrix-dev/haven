import React, { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@shared/components/ui/collapsible";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@shared/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shared/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";
import { Textarea } from "@shared/components/ui/textarea";
import { ProfileContextMenu } from "@shared/components/ProfileContextMenu";
import { ActionMenuContent } from "@shared/components/menus/ActionMenuContent";
import { Database } from "@shared/types/database";
import { resolveContextMenuIntent } from "@shared/lib/contextMenu";
import { traceContextMenuEvent } from "@shared/lib/contextMenu/debugTrace";
import { getErrorMessage } from "@platform/lib/errors";
import type { MenuActionNode } from "@shared/lib/contextMenu/types";
import type {
  BanEligibleServer,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from "@shared/lib/backend/types";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { MarkdownText } from "@shared/lib/markdownRenderer";
import {
  BANNED_REPLY_PLACEHOLDER_CONTENT,
  filterHiddenMessageContent,
  filterBlockedUserContent,
  isModerationRemovedReplyPlaceholder,
} from "@client/features/messages/lib/banVisibility";
import { getLiveProfile } from "@shared/lib/liveProfiles";
import { useLiveProfilesStore } from "@shared/stores/liveProfilesStore";
import { useMessagesStore } from "@shared/stores/messagesStore";

type Message = Database["public"]["Tables"]["messages"]["Row"];
const QUICK_REACTION_EMOJI = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F389}",
] as const;
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

const isAuthorProfileTombstone = (
  authorProfile: AuthorProfile | undefined,
): boolean =>
  Boolean(
    authorProfile &&
    authorProfile.avatarUrl === null &&
    (authorProfile.username === "Banned User" ||
      authorProfile.username === "Unknown User"),
  );

interface MessageListProps {
  channelId: string;
  currentUserId: string;
  blockedUserIds: ReadonlySet<string>;
  isElevatedViewer: boolean;
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
  bottomInset?: number;
  showHiddenMessages?: boolean;
}

const getReplyToMessageId = (message: Message): string | null => {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const replyTo = (metadata as Record<string, unknown>).replyToMessageId;
  return typeof replyTo === "string" && replyTo.trim().length > 0
    ? replyTo
    : null;
};

const getAuthorLabel = (
  message: Message,
  authorProfile: AuthorProfile | undefined,
  currentUserId: string,
): string => {
  if (message.author_type === "haven_dev") return "Haven Moderation Team";
  if (message.author_type === "system") return "System";

  const username =
    authorProfile?.username ??
    message.author_user_id?.substring(0, 12) ??
    "Unknown User";
  if (message.author_user_id === currentUserId) return `${username} (You)`;
  return username; // CHECKPOINT 1 COMPLETE
};

const getAuthorColor = (
  message: Message,
  authorProfile: AuthorProfile | undefined,
  currentUserId: string,
): string => {
  const isStaffUserMessage =
    message.author_type === "user" && Boolean(authorProfile?.isPlatformStaff);
  const isOwnMessage =
    message.author_type === "user" && message.author_user_id === currentUserId;

  if (message.author_type === "haven_dev") return "#d6a24a";
  if (isOwnMessage) return "#3f79d8";
  if (isStaffUserMessage) return "#59b7ff";
  return "#44b894";
};

const URL_SEGMENT_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

const trimTrailingUrlPunctuation = (
  value: string,
): { url: string; trailing: string } => {
  let end = value.length;
  while (end > 0 && /[.,!?;:]$/.test(value.slice(0, end))) {
    end -= 1;
  }
  return {
    url: value.slice(0, end),
    trailing: value.slice(end),
  };
};

const renderLinkifiedMessageText = (content: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;
  URL_SEGMENT_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(URL_SEGMENT_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0] ?? "";
    if (start > lastIndex) {
      nodes.push(
        <React.Fragment key={`text-${matchIndex}-${lastIndex}`}>
          {content.slice(lastIndex, start)}
        </React.Fragment>,
      );
    }

    const { url, trailing } = trimTrailingUrlPunctuation(raw);
    if (url.length > 0) {
      nodes.push(
        <a
          key={`link-${matchIndex}-${start}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[#8fc1ff] hover:text-[#b4d6ff] underline break-all"
        >
          {url}
        </a>,
      );
    } else {
      nodes.push(
        <React.Fragment key={`link-fallback-${matchIndex}-${start}`}>
          {raw}
        </React.Fragment>,
      );
    }
    if (trailing) {
      nodes.push(
        <React.Fragment key={`trail-${matchIndex}-${start}`}>
          {trailing}
        </React.Fragment>,
      );
    }

    lastIndex = start + raw.length;
    matchIndex += 1;
  }

  if (lastIndex < content.length) {
    nodes.push(
      <React.Fragment key={`tail-${lastIndex}`}>
        {content.slice(lastIndex)}
      </React.Fragment>,
    );
  }

  return nodes.length > 0 ? nodes : [content];
};

const messageContainsHttpUrl = (content: string): boolean => {
  URL_SEGMENT_PATTERN.lastIndex = 0;
  return URL_SEGMENT_PATTERN.test(content);
};

const extractYoutubeVideoId = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[a-zA-Z0-9_-]{6,20}$/.test(fromQuery))
        return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts") &&
        /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1] ?? "")
      ) {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const extractVimeoVideoId = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().endsWith("vimeo.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (/^\d{6,15}$/.test(parts[index])) return parts[index];
    }
  } catch {
    return null;
  }

  return null;
};

const getFallbackEmbedUrl = (preview: MessageLinkPreview): string | null => {
  const embed = preview.snapshot?.embed;
  if (!embed) return null;

  const candidateSourceUrls = [
    preview.snapshot?.canonicalUrl,
    preview.snapshot?.finalUrl,
    preview.snapshot?.sourceUrl,
    preview.sourceUrl,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  if (embed.provider === "youtube") {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractYoutubeVideoId(rawUrl);
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    return null;
  }

  if (embed.provider === "vimeo") {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractVimeoVideoId(rawUrl);
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  return null;
};

type MessageReactionSummaryState = {
  count: number;
  reactedByCurrentUser: boolean;
};

interface MessageRowProps {
  message: Message;
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
  repliesByParentId: ReadonlyMap<string, Message[]>;
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
  message: Message;
  depth: number;
  ancestorPath: string;
}

interface MessageVirtuosoItemProps extends MessageTreeSharedProps {
  message: Message;
}

const EMPTY_MESSAGE_ATTACHMENTS: readonly MessageAttachment[] = [];
const EMPTY_MESSAGE_REACTION_MAP: ReadonlyMap<
  string,
  MessageReactionSummaryState
> = new Map<string, MessageReactionSummaryState>();
const EMPTY_REPLY_MESSAGES: readonly Message[] = [];
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

const areMessagesEqual = (previousMessage: Message, nextMessage: Message) => {
  if (previousMessage === nextMessage) return true;

  return (
    previousMessage.id === nextMessage.id &&
    previousMessage.author_type === nextMessage.author_type &&
    previousMessage.author_user_id === nextMessage.author_user_id &&
    previousMessage.content === nextMessage.content &&
    previousMessage.created_at === nextMessage.created_at &&
    previousMessage.is_hidden === nextMessage.is_hidden &&
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
  const isModerationPlaceholder = isModerationRemovedReplyPlaceholder(message);
  const isReply = depth > 0;
  const replyIndent = Math.min(depth, 4) * 20;

  if (isModerationPlaceholder) {
    return (
      <div
        className="flex gap-3"
        style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
      >
        <div className="min-w-0 flex-1 rounded-xl border border-dashed border-[#304867] bg-[#142033] px-4 py-3 text-sm italic text-[#8ea4c7]">
          {BANNED_REPLY_PLACEHOLDER_CONTENT}
        </div>
      </div>
    );
  }

  const isStaffUserMessage =
    message.author_type === "user" && Boolean(authorProfile?.isPlatformStaff);
  const isHiddenMessage = message.is_hidden;
  const isOwnMessage =
    message.author_type === "user" && message.author_user_id === currentUserId;
  const canProfileMenu =
    message.author_type === "user" && Boolean(message.author_user_id);
  const kickDisabledReason =
    canManageMembers &&
    message.author_user_id !== currentUserId &&
    (isHiddenMessage || authorProfile?.username === "Banned User")
      ? "User is not a member"
      : null;
  const canDeleteMessage = isOwnMessage || canManageMessages;
  const canEditMessage = isOwnMessage;
  const authorLabel = getAuthorLabel(message, authorProfile, currentUserId);
  const authorColor = getAuthorColor(message, authorProfile, currentUserId);
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
              : "bg-[#16263d] border-[#2b4263] hover:bg-[#1b2f4a] hover:border-[#3d5f8d]"
          } ${isReply ? "border-l-2 border-l-[#4c74a6]" : ""}`}
          style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              {canProfileMenu && message.author_user_id ? (
                <ProfileContextMenu
                  userId={message.author_user_id}
                  username={authorLabel}
                  avatarUrl={authorProfile?.avatarUrl ?? null}
                  canDirectMessage={message.author_user_id !== currentUserId}
                  canReport={
                    canCreateReports && message.author_user_id !== currentUserId
                  }
                  canBan={
                    canManageBans && message.author_user_id !== currentUserId
                  }
                  canKick={
                    canManageMembers && message.author_user_id !== currentUserId
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
                <span className="px-1.5 py-0.5 rounded bg-[#59b7ff]/20 text-[#9cd6ff] text-[10px] font-semibold uppercase tracking-wide">
                  Staff
                </span>
              )}
              {isHiddenMessage && (
                <span className="rounded border border-red-300/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-100">
                  Hidden - banned user
                </span>
              )}
              <span className="text-xs text-[#8897b1] shrink-0">
                {new Date(message.created_at).toLocaleTimeString([], {
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
                    className="text-[#95a5bf] hover:text-white hover:bg-[#22334f]"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-[#18243a] border-[#304867] text-white"
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
                className="bg-[#142033] border-[#304867] text-white"
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
                  className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
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
                <div className="text-[#e6edf7] text-[15px] leading-[1.375] break-words">
                  <MarkdownText content={message.content} />
                </div>
              )}

              {messageLinkPreviewRow?.status === "pending" && (
                <div className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-[#8ea4c7]">
                    Link preview
                  </p>
                  <p className="text-xs text-[#a9b8cf]">Fetching preview...</p>
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
                              className="overflow-hidden rounded-md border border-[#304867] bg-[#0d1626]"
                              style={{ maxWidth: "480px" }}
                            >
                              <div
                                className="bg-[#0d1626]"
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
                                  className="block border-t border-[#304867] bg-[#142033] px-3 py-2 hover:bg-[#182740] transition-colors"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {messageLinkPreviewRow.snapshot
                                      .siteName && (
                                      <span className="shrink-0 rounded-sm bg-[#223754] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a8c4ea]">
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
                                    <span className="shrink-0 text-[11px] text-[#8ea4c7]">
                                      Open
                                    </span>
                                  </div>
                                  {messageLinkPreviewRow.snapshot
                                    .description && (
                                    <p className="mt-1 text-xs text-[#bfd0ea] leading-snug max-h-8 overflow-hidden">
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
                        className="block rounded-md border border-[#304867] bg-[#142033] hover:bg-[#1a2943] transition-colors overflow-hidden"
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
                            className="w-full max-h-64 object-cover bg-[#0d1626]"
                          />
                        )}
                        <div className="px-3 py-2 space-y-1">
                          {messageLinkPreviewRow.snapshot.siteName && (
                            <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">
                              {messageLinkPreviewRow.snapshot.siteName}
                            </p>
                          )}
                          {messageLinkPreviewRow.snapshot.title && (
                            <p className="text-sm font-semibold text-white leading-snug">
                              {messageLinkPreviewRow.snapshot.title}
                            </p>
                          )}
                          {messageLinkPreviewRow.snapshot.description && (
                            <p className="text-xs text-[#bfd0ea] leading-snug">
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
                            className="max-h-64 rounded-md border border-[#304867] object-contain bg-[#0d1626]"
                          />
                          <p className="text-[11px] text-[#8ea4c7]">
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
                            className="max-h-72 rounded-md border border-[#304867] bg-[#0d1626]"
                          />
                          <p className="text-[11px] text-[#8ea4c7]">
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
                            className="text-sm text-[#8fc1ff] hover:text-[#b4d6ff] underline"
                          >
                            {attachmentLabel}
                          </a>
                        ) : (
                          <span className="text-sm text-[#a9b8cf]">
                            {attachmentLabel}
                          </span>
                        )}
                        <p className="text-[11px] text-[#8ea4c7]">
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
                            ? "border-[#3f79d8] bg-[#3f79d8]/20 text-[#dbe9ff]"
                            : "border-[#304867] bg-[#142033] text-[#b8c7dd] hover:text-white"
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
      <ContextMenuContent className="bg-[#18243a] border-[#304867] text-white">
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
            className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-[#8ea4c7] gpu-layer transition-colors hover:bg-[#22334f] hover:text-white focus-visible:ring-2 focus-visible:ring-[#5b92e8] focus-visible:outline-none"
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
  currentUserId,
  blockedUserIds,
  isElevatedViewer,
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
  bottomInset = 96,
  showHiddenMessages = false,
}: MessageListProps) {
  const messages = useMessagesStore((state) => state.messages);
  const reactionRecord = useMessagesStore((state) => state.reactions);
  const attachmentRecord = useMessagesStore((state) => state.attachments);
  const linkPreviewRecord = useMessagesStore((state) => state.linkPreviews);
  const authorProfiles = useMessagesStore((state) => state.profiles);
  const liveProfiles = useLiveProfilesStore((state) => state.profiles);
  const hasOlderMessages = useMessagesStore((state) => state.hasMore);
  const isLoadingOlderMessages = useMessagesStore((state) => state.isLoading);
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

  const messageReactions = useMemo(
    () => Object.values(reactionRecord),
    [reactionRecord],
  );
  const messageAttachments = useMemo(
    () => Object.values(attachmentRecord),
    [attachmentRecord],
  );
  const messageLinkPreviews = useMemo(
    () => Object.values(linkPreviewRecord),
    [linkPreviewRecord],
  );

  const visibleBundle = useMemo(
    () =>
      filterHiddenMessageContent(
        filterBlockedUserContent(
          {
            messages,
            reactions: messageReactions,
            attachments: messageAttachments,
            linkPreviews: messageLinkPreviews,
          },
          blockedUserIds,
          isElevatedViewer,
        ),
        showHiddenMessages,
      ),
    [
      blockedUserIds,
      isElevatedViewer,
      messageAttachments,
      messageLinkPreviews,
      messageReactions,
      messages,
      showHiddenMessages,
    ],
  );

  const visibleMessages = visibleBundle.messages;
  const visibleReactions = visibleBundle.reactions;
  const visibleAttachments = visibleBundle.attachments;
  const visibleLinkPreviews = visibleBundle.linkPreviews;

  const messageById = useMemo(() => {
    const next = new Map<string, Message>();
    for (const message of visibleMessages) {
      next.set(message.id, message);
    }
    return next;
  }, [visibleMessages]);

  const attachmentsByMessageId = useMemo(() => {
    const next = new Map<string, MessageAttachment[]>();
    for (const attachment of visibleAttachments) {
      if (!messageById.has(attachment.messageId)) continue;
      const existing = next.get(attachment.messageId) ?? [];
      existing.push(attachment);
      next.set(attachment.messageId, existing);
    }
    return next;
  }, [messageById, visibleAttachments]);

  const linkPreviewByMessageId = useMemo(() => {
    const next = new Map<string, MessageLinkPreview>();
    for (const preview of visibleLinkPreviews) {
      if (!messageById.has(preview.messageId)) continue;
      next.set(preview.messageId, preview);
    }
    return next;
  }, [messageById, visibleLinkPreviews]);

  const getRenderableEmbedUrl = React.useCallback(
    (preview: MessageLinkPreview): string | null => {
      const embed = preview.snapshot?.embed;
      if (!embed?.embedUrl) return null;

      try {
        const url = new URL(embed.embedUrl);
        // Prefer the privacy-enhanced embed host. We validate the path below and fall back to a
        // reconstructed embed URL if cached rows contain malformed values.
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
    for (const reaction of visibleReactions) {
      if (!messageById.has(reaction.messageId)) continue;
      const byEmoji =
        next.get(reaction.messageId) ??
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
      next.set(reaction.messageId, byEmoji);
    }
    return next;
  }, [currentUserId, messageById, visibleReactions]);

  const replyTree = useMemo(() => {
    const repliesByParentId = new Map<string, Message[]>();
    const rootMessages: Message[] = [];

    for (const message of visibleMessages) {
      const parentId = getReplyToMessageId(message);
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

    // Guard against malformed reply graphs that would otherwise render nothing.
    if (rootMessages.length === 0 && visibleMessages.length > 0) {
      return {
        rootMessages: visibleMessages,
        repliesByParentId: new Map<string, Message[]>(),
      };
    }

    return { rootMessages, repliesByParentId };
  }, [messageById, visibleMessages]);

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

  const getResolvedAuthorProfile = React.useCallback(
    (targetUserId: string | null | undefined): AuthorProfile | undefined => {
      if (!targetUserId) return undefined;

      const authorProfile = authorProfiles[targetUserId];
      const liveProfile = getLiveProfile(liveProfiles, targetUserId);
      if (!authorProfile && !liveProfile) return undefined;
      const preserveFetchedTombstone = isAuthorProfileTombstone(authorProfile);

      return {
        username:
          (preserveFetchedTombstone ? null : liveProfile?.username) ??
          authorProfile?.username ??
          targetUserId.substring(0, 12),
        isPlatformStaff: authorProfile?.isPlatformStaff ?? false,
        displayPrefix: authorProfile?.displayPrefix ?? null,
        avatarUrl:
          (preserveFetchedTombstone ? null : liveProfile?.avatarUrl) ??
          authorProfile?.avatarUrl ??
          null,
      };
    },
    [authorProfiles, liveProfiles],
  );

  const authorProfilesByMessageId = useMemo(() => {
    const next = new Map<string, AuthorProfile | undefined>();
    for (const message of visibleMessages) {
      next.set(message.id, getResolvedAuthorProfile(message.author_user_id));
    }
    return next;
  }, [getResolvedAuthorProfile, visibleMessages]);

  const reportProfile = React.useCallback(
    async (targetUserId: string) => {
      if (!canCreateReports) {
        setActionError(
          "You do not have permission to report profiles in this server.",
        );
        return;
      }
      const profile = getResolvedAuthorProfile(targetUserId);
      setProfileReportDraft({
        targetUserId,
        username: profile?.username ?? targetUserId.substring(0, 12),
      });
      setProfileReportReason("");
      setProfileReportSubmitting(false);
      setActionError(null);
    },
    [canCreateReports, getResolvedAuthorProfile],
  );

  const openBanDialog = React.useCallback(
    (targetUserId: string, communityId: string) => {
      const profile = getResolvedAuthorProfile(targetUserId);
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
    [getResolvedAuthorProfile],
  );

  const openKickDialog = React.useCallback(
    (targetUserId: string) => {
      const profile = getResolvedAuthorProfile(targetUserId);
      const username = profile?.username ?? targetUserId.substring(0, 12);
      setKickDraft({
        targetUserId,
        username,
      });
      setKickSubmitting(false);
      setActionError(null);
    },
    [getResolvedAuthorProfile],
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
    (_index: number, message: Message) => (
      <MessageVirtuosoItem {...messageTreeSharedProps} message={message} />
    ),
    [messageTreeSharedProps],
  );

  const computeItemKey = React.useCallback(
    (_index: number, message: Message) => message.id,
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
            <div className="rounded-full border border-[#304867] bg-[#142033] px-3 py-1 text-[11px] text-[#9fb4d5]">
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
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Report Profile</DialogTitle>
            <DialogDescription className="text-[#a9b8cf]">
              Send a profile report to moderators for review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-[#c7d5ea]">
              Target:{" "}
              <span className="font-semibold text-white">
                {profileReportDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Reason (required)
            </label>
            <Textarea
              value={profileReportReason}
              onChange={(event) => setProfileReportReason(event.target.value)}
              maxLength={1000}
              className="bg-[#142033] border-[#304867] text-white"
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
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
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
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Report Message</DialogTitle>
            <DialogDescription className="text-[#a9b8cf]">
              Route this report to server staff, the Haven Moderation Team, or
              both while preserving a snapshot of the current context.
            </DialogDescription>
            {/* CHECKPOINT 6 COMPLETE */}
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">
                Destination
              </label>
              <select
                value={reportTarget}
                onChange={(event) =>
                  setReportTarget(event.target.value as MessageReportTarget)
                }
                className="w-full rounded-md border border-[#304867] bg-[#142033] px-3 py-2 text-sm text-white"
              >
                <option value="haven_staff">Haven Moderation Team</option>
                <option value="server_admins">Server Staff</option>
                <option value="both">Both</option>
              </select>
              {/* CHECKPOINT 3 COMPLETE */}
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">
                Type
              </label>
              <select
                value={reportKind}
                onChange={(event) =>
                  setReportKind(event.target.value as MessageReportKind)
                }
                className="w-full rounded-md border border-[#304867] bg-[#142033] px-3 py-2 text-sm text-white"
              >
                <option value="content_abuse">Report Content Abuse</option>
                <option value="bug">Report Bug</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">
                Comment
              </label>
              <Textarea
                value={reportComment}
                onChange={(event) => setReportComment(event.target.value)}
                maxLength={1000}
                className="bg-[#142033] border-[#304867] text-white"
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
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
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
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription className="text-[#a9b8cf]">
              Bans remove server access immediately and block rejoin until
              unbanned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-[#c7d5ea]">
              Target:{" "}
              <span className="font-semibold text-white">
                {banDraft?.username ?? "Unknown user"}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">
              Reason (required)
            </label>
            <Textarea
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              maxLength={1000}
              className="bg-[#142033] border-[#304867] text-white"
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
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ban</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
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
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Removal</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
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
