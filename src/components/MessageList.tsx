import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProfileContextMenu } from '@/components/ProfileContextMenu';
import { ActionMenuContent } from '@/components/menus/ActionMenuContent';
import { Database } from '@/types/database';
import { resolveContextMenuIntent } from '@/lib/contextMenu';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';
import { getErrorMessage } from '@/shared/lib/errors';
import type { MenuActionNode } from '@/lib/contextMenu/types';
import type {
  BanEligibleServer,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from '@/lib/backend/types';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

type Message = Database['public']['Tables']['messages']['Row'];
const QUICK_REACTION_EMOJI = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}'] as const;
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

interface MessageListProps {
  channelId: string;
  messages: Message[];
  messageReactions: MessageReaction[];
  messageAttachments: MessageAttachment[];
  messageLinkPreviews: MessageLinkPreview[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
  canManageMessages: boolean;
  canCreateReports: boolean;
  canManageBans: boolean;
  canRefreshLinkPreviews: boolean;
  onSaveAttachment: (attachment: MessageAttachment) => Promise<void>;
  onReportUserProfile: (input: { targetUserId: string; reason: string }) => Promise<void>;
  onBanUserFromServer: (input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) => Promise<void>;
  onResolveBanEligibleServers: (targetUserId: string) => Promise<BanEligibleServer[]>;
  onDirectMessageUser: (targetUserId: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  onReplyToMessage: (target: { id: string; authorLabel: string; preview: string }) => void;
  onReportMessage: (input: {
    messageId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) => Promise<void>;
  onRequestMessageLinkPreviewRefresh: (messageId: string) => Promise<void>;
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onRequestOlderMessages?: () => Promise<void>;
}

const getReplyToMessageId = (message: Message): string | null => {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const replyTo = (metadata as Record<string, unknown>).replyToMessageId;
  return typeof replyTo === 'string' && replyTo.trim().length > 0 ? replyTo : null;
};

const canCurrentUserViewMessage = (_message: Message): boolean => {
  // Blocking/visibility policy hooks will be wired here once moderation graph lands.
  return true;
};

const getAuthorLabel = (
  message: Message,
  authorProfile: AuthorProfile | undefined,
  currentUserId: string
): string => {
  if (message.author_type === 'haven_dev') return 'Haven Developer';
  if (message.author_type === 'system') return 'System';

  const username = authorProfile?.username ?? message.author_user_id?.substring(0, 12) ?? 'Unknown User';
  if (authorProfile?.isPlatformStaff) {
    return `${authorProfile.displayPrefix ?? 'Haven'}-${username}`;
  }
  if (message.author_user_id === currentUserId) return `${username} (You)`;
  return username;
};

const getAuthorColor = (
  message: Message,
  authorProfile: AuthorProfile | undefined,
  currentUserId: string
): string => {
  const isStaffUserMessage = message.author_type === 'user' && Boolean(authorProfile?.isPlatformStaff);
  const isOwnMessage = message.author_type === 'user' && message.author_user_id === currentUserId;

  if (message.author_type === 'haven_dev') return '#d6a24a';
  if (isOwnMessage) return '#3f79d8';
  if (isStaffUserMessage) return '#59b7ff';
  return '#44b894';
};

const URL_SEGMENT_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

const trimTrailingUrlPunctuation = (value: string): { url: string; trailing: string } => {
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
    const raw = match[0] ?? '';
    if (start > lastIndex) {
      nodes.push(
        <React.Fragment key={`text-${matchIndex}-${lastIndex}`}>
          {content.slice(lastIndex, start)}
        </React.Fragment>
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
        </a>
      );
    } else {
      nodes.push(
        <React.Fragment key={`link-fallback-${matchIndex}-${start}`}>{raw}</React.Fragment>
      );
    }
    if (trailing) {
      nodes.push(
        <React.Fragment key={`trail-${matchIndex}-${start}`}>{trailing}</React.Fragment>
      );
    }

    lastIndex = start + raw.length;
    matchIndex += 1;
  }

  if (lastIndex < content.length) {
    nodes.push(<React.Fragment key={`tail-${lastIndex}`}>{content.slice(lastIndex)}</React.Fragment>);
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
    if (host === 'youtu.be') {
      const candidate = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const fromQuery = url.searchParams.get('v');
      if (fromQuery && /^[a-zA-Z0-9_-]{6,20}$/.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts') && /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1] ?? '')) {
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
    if (!url.hostname.toLowerCase().endsWith('vimeo.com')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
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
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (embed.provider === 'youtube') {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractYoutubeVideoId(rawUrl);
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    return null;
  }

  if (embed.provider === 'vimeo') {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractVimeoVideoId(rawUrl);
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  return null;
};

export function MessageList({
  channelId,
  messages,
  messageReactions,
  messageAttachments,
  messageLinkPreviews,
  authorProfiles,
  currentUserId,
  canManageMessages,
  canCreateReports,
  canManageBans,
  canRefreshLinkPreviews,
  onSaveAttachment,
  onReportUserProfile,
  onBanUserFromServer,
  onResolveBanEligibleServers,
  onDirectMessageUser,
  onDeleteMessage,
  onEditMessage,
  onToggleMessageReaction,
  onReplyToMessage,
  onReportMessage,
  onRequestMessageLinkPreviewRefresh,
  hasOlderMessages = false,
  isLoadingOlderMessages = false,
  onRequestOlderMessages,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const isAtBottomRef = useRef(true);
  const previousChannelIdRef = useRef(channelId);
  const previousRootMessageIdsRef = useRef<string[]>([]);
  const olderLoadInFlightRef = useRef(false);
  const shouldScrollToBottomOnNextDataRef = useRef(true);
  const [firstItemIndex, setFirstItemIndex] = useState(1_000_000);
  const [expandedReplyThreads, setExpandedReplyThreads] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusyMessageId, setActionBusyMessageId] = useState<string | null>(null);
  const [reactionBusyKeys, setReactionBusyKeys] = useState<Record<string, boolean>>({});
  const [reportDialogMessageId, setReportDialogMessageId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<MessageReportTarget>('server_admins');
  const [reportKind, setReportKind] = useState<MessageReportKind>('content_abuse');
  const [reportComment, setReportComment] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [profileReportDraft, setProfileReportDraft] = useState<{
    targetUserId: string;
    username: string;
  } | null>(null);
  const [profileReportReason, setProfileReportReason] = useState('');
  const [profileReportSubmitting, setProfileReportSubmitting] = useState(false);
  const [banDraft, setBanDraft] = useState<{
    targetUserId: string;
    communityId: string;
    username: string;
  } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [banConfirmOpen, setBanConfirmOpen] = useState(false);

  const visibleMessages = useMemo(
    () => messages.filter(canCurrentUserViewMessage),
    [messages]
  );

  const messageById = useMemo(() => {
    const next = new Map<string, Message>();
    for (const message of visibleMessages) {
      next.set(message.id, message);
    }
    return next;
  }, [visibleMessages]);

  const attachmentsByMessageId = useMemo(() => {
    const next = new Map<string, MessageAttachment[]>();
    for (const attachment of messageAttachments) {
      if (!messageById.has(attachment.messageId)) continue;
      const existing = next.get(attachment.messageId) ?? [];
      existing.push(attachment);
      next.set(attachment.messageId, existing);
    }
    return next;
  }, [messageAttachments, messageById]);

  const linkPreviewByMessageId = useMemo(() => {
    const next = new Map<string, MessageLinkPreview>();
    for (const preview of messageLinkPreviews) {
      if (!messageById.has(preview.messageId)) continue;
      next.set(preview.messageId, preview);
    }
    return next;
  }, [messageLinkPreviews, messageById]);

  const getRenderableEmbedUrl = React.useCallback((preview: MessageLinkPreview): string | null => {
    const embed = preview.snapshot?.embed;
    if (!embed?.embedUrl) return null;

    try {
      const url = new URL(embed.embedUrl);
      // Prefer the privacy-enhanced embed host. We validate the path below and fall back to a
      // reconstructed embed URL if cached rows contain malformed values.
      if (embed.provider === 'youtube' && url.hostname.toLowerCase() === 'www.youtube.com') {
        url.hostname = 'www.youtube-nocookie.com';
      }
      if (embed.provider === 'youtube' && !url.pathname.startsWith('/embed/')) {
        return getFallbackEmbedUrl(preview);
      }
      if (embed.provider === 'vimeo' && !url.pathname.startsWith('/video/')) {
        return getFallbackEmbedUrl(preview);
      }
      return url.toString();
    } catch {
      return getFallbackEmbedUrl(preview) ?? embed.embedUrl;
    }
  }, []);

  const reactionsByMessageId = useMemo(() => {
    const next = new Map<string, Map<string, { count: number; reactedByCurrentUser: boolean }>>();
    for (const reaction of messageReactions) {
      if (!messageById.has(reaction.messageId)) continue;
      const byEmoji = next.get(reaction.messageId) ?? new Map<string, { count: number; reactedByCurrentUser: boolean }>();
      const current = byEmoji.get(reaction.emoji) ?? { count: 0, reactedByCurrentUser: false };
      current.count += 1;
      if (reaction.userId === currentUserId) {
        current.reactedByCurrentUser = true;
      }
      byEmoji.set(reaction.emoji, current);
      next.set(reaction.messageId, byEmoji);
    }
    return next;
  }, [currentUserId, messageById, messageReactions]);

  const replyTree = useMemo(() => {
    const repliesByParentId = new Map<string, Message[]>();
    const rootMessages: Message[] = [];

    for (const message of visibleMessages) {
      const parentId = getReplyToMessageId(message);
      const parentExists = Boolean(parentId && parentId !== message.id && messageById.has(parentId));

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
      return { rootMessages: visibleMessages, repliesByParentId: new Map<string, Message[]>() };
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
    const nextRootMessageIds = replyTree.rootMessages.map((message) => message.id);
    const previousRootMessageIds = previousRootMessageIdsRef.current;

    if (previousRootMessageIds.length > 0 && nextRootMessageIds.length > previousRootMessageIds.length) {
      const previousIsSuffix = previousRootMessageIds.every((messageId, index) => {
        const nextIndex = nextRootMessageIds.length - previousRootMessageIds.length + index;
        return nextRootMessageIds[nextIndex] === messageId;
      });

      if (previousIsSuffix) {
        setFirstItemIndex((prev) => prev - (nextRootMessageIds.length - previousRootMessageIds.length));
      }
    }

    previousRootMessageIdsRef.current = nextRootMessageIds;
  }, [replyTree.rootMessages]);

  useEffect(() => {
    if (!editingMessageId || messageById.has(editingMessageId)) return;
    setEditingMessageId(null);
    setEditingContent('');
  }, [editingMessageId, messageById]);

  useEffect(() => {
    if (!actionBusyMessageId || messageById.has(actionBusyMessageId)) return;
    setActionBusyMessageId(null);
  }, [actionBusyMessageId, messageById]);

  useEffect(() => {
    if (!reportDialogMessageId || messageById.has(reportDialogMessageId)) return;
    setReportDialogMessageId(null);
    setReportSubmitting(false);
  }, [messageById, reportDialogMessageId]);

  useEffect(() => {
    setExpandedReplyThreads({});
    setEditingMessageId(null);
    setEditingContent('');
    setActionBusyMessageId(null);
    setReactionBusyKeys({});
    setReportDialogMessageId(null);
    setReportSubmitting(false);
    setProfileReportDraft(null);
    setProfileReportReason('');
    setProfileReportSubmitting(false);
    setBanDraft(null);
    setBanReason('');
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
        const separatorIndex = key.indexOf(':');
        const messageId = separatorIndex > 0 ? key.slice(0, separatorIndex) : key;
        if (!messageById.has(messageId)) {
          changed = true;
          continue;
        }
        next[key] = isBusy;
      }

      return changed ? next : prev;
    });
  }, [messageById]);

  const toggleReaction = React.useCallback(
    async (messageId: string, emoji: string) => {
      const reactionKey = `${messageId}:${emoji}`;
      if (reactionBusyKeys[reactionKey]) return;

      setReactionBusyKeys((prev) => ({ ...prev, [reactionKey]: true }));
      setActionError(null);

      try {
        await onToggleMessageReaction(messageId, emoji);
      } catch (error: unknown) {
        setActionError(getErrorMessage(error, 'Failed to update reaction.'));
      } finally {
        setReactionBusyKeys((prev) => {
          const { [reactionKey]: _removed, ...rest } = prev;
          return rest;
        });
      }
    },
    [onToggleMessageReaction, reactionBusyKeys]
  );

  const reportProfile = React.useCallback(
    async (targetUserId: string) => {
      if (!canCreateReports) {
        setActionError('You do not have permission to report profiles in this server.');
        return;
      }
      const profile = authorProfiles[targetUserId];
      setProfileReportDraft({
        targetUserId,
        username: profile?.username ?? targetUserId.substring(0, 12),
      });
      setProfileReportReason('');
      setProfileReportSubmitting(false);
      setActionError(null);
    },
    [authorProfiles, canCreateReports]
  );

  const openBanDialog = React.useCallback(
    (targetUserId: string, communityId: string) => {
      const profile = authorProfiles[targetUserId];
      const username = profile?.username ?? targetUserId.substring(0, 12);
      setBanDraft({
        targetUserId,
        communityId,
        username,
      });
      setBanReason('');
      setBanSubmitting(false);
      setBanConfirmOpen(false);
      setActionError(null);
    },
    [authorProfiles]
  );

  const renderMessageRow = (message: Message, depth = 0) => {
    const authorProfile = message.author_user_id ? authorProfiles[message.author_user_id] : undefined;
    const isStaffUserMessage = message.author_type === 'user' && Boolean(authorProfile?.isPlatformStaff);
    const isOwnMessage = message.author_type === 'user' && message.author_user_id === currentUserId;
    const canProfileMenu = message.author_type === 'user' && Boolean(message.author_user_id);
    const canDeleteMessage = isOwnMessage || canManageMessages;
    const canEditMessage = isOwnMessage;
    const authorLabel = getAuthorLabel(message, authorProfile, currentUserId);
    const authorColor = getAuthorColor(message, authorProfile, currentUserId);
    const isEditing = editingMessageId === message.id;
    const isReply = depth > 0;
    const replyIndent = Math.min(depth, 4) * 20;
    const messageReactionMap = reactionsByMessageId.get(message.id) ?? new Map();
    const reactionSummaries = Array.from(messageReactionMap.entries());
    const messageAttachmentRows = attachmentsByMessageId.get(message.id) ?? [];
    const messageLinkPreviewRow = linkPreviewByMessageId.get(message.id) ?? null;
    const messageHasHttpUrl = messageContainsHttpUrl(message.content);
    const trimmedMessageContent = message.content.trim();
    const isInvisibleMediaPlaceholder = /^[\u200B\u200C\u200D\uFEFF]+$/.test(message.content);
    const hideMediaPlaceholder =
      messageAttachmentRows.length > 0 &&
      (/^\[(media|image|file)\]$/i.test(trimmedMessageContent) || isInvisibleMediaPlaceholder);

    const messageActions: MenuActionNode[] = [];

    if (canEditMessage) {
      messageActions.push({
        kind: 'item',
        key: 'edit',
        label: 'Edit',
        onSelect: () => {
          setActionError(null);
          setEditingMessageId(message.id);
          setEditingContent(message.content);
        },
      });
    }

    if (canDeleteMessage) {
      messageActions.push({
        kind: 'item',
        key: 'delete',
        label: 'Delete',
        destructive: true,
        disabled: actionBusyMessageId === message.id,
        onSelect: () => {
          setActionError(null);
          setActionBusyMessageId(message.id);
          void onDeleteMessage(message.id)
            .catch((error: unknown) => {
              setActionError(getErrorMessage(error, 'Failed to delete message.'));
            })
            .finally(() => {
              setActionBusyMessageId((prev) => (prev === message.id ? null : prev));
            });
        },
      });
    }

    if (messageActions.length > 0) {
      messageActions.push({ kind: 'separator', key: 'separator-edit-delete' });
    }

    messageActions.push({
      kind: 'item',
      key: 'reply',
      label: 'Reply',
      onSelect: () =>
        onReplyToMessage({
          id: message.id,
          authorLabel,
          preview: message.content,
        }),
    });
    messageActions.push({
      kind: 'separator',
      key: 'separator-reply',
    });

    messageActions.push({
      kind: 'submenu',
      key: 'react-submenu',
      label: 'React',
      items: QUICK_REACTION_EMOJI.map((emoji) => {
        const reactionKey = `${message.id}:${emoji}`;
        return {
          kind: 'item',
          key: `react-${reactionKey}`,
          label: emoji,
          disabled: Boolean(reactionBusyKeys[reactionKey]),
          onSelect: () => {
            void toggleReaction(message.id, emoji);
          },
        } satisfies MenuActionNode;
      }),
    });

    if (canRefreshLinkPreviews && messageHasHttpUrl) {
      const previewRefreshLabel =
        messageLinkPreviewRow?.status === 'ready'
          ? 'Refresh link preview'
          : messageLinkPreviewRow?.status === 'pending'
            ? 'Link preview pending'
            : 'Generate link preview';

      messageActions.push({ kind: 'separator', key: 'separator-link-preview-refresh' });
      messageActions.push({
        kind: 'item',
        key: 'refresh-link-preview',
        label: previewRefreshLabel,
        disabled:
          actionBusyMessageId === message.id || messageLinkPreviewRow?.status === 'pending',
        onSelect: () => {
          setActionError(null);
          setActionBusyMessageId(message.id);
          void onRequestMessageLinkPreviewRefresh(message.id)
            .catch((error: unknown) => {
              setActionError(getErrorMessage(error, 'Failed to refresh link preview.'));
            })
            .finally(() => {
              setActionBusyMessageId((prev) => (prev === message.id ? null : prev));
            });
        },
      });
    }

    if (messageAttachmentRows.length > 0) {
      messageActions.push({ kind: 'separator', key: 'separator-attachments' });
      messageActions.push({
        kind: 'submenu',
        key: 'save-media-submenu',
        label: 'Save media',
        items: messageAttachmentRows.map((attachment) => {
          const attachmentLabel =
            attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'media';
          return {
            kind: 'item',
            key: `save-media-${attachment.id}`,
            label: attachmentLabel,
            onSelect: () => {
              void onSaveAttachment(attachment).catch((error: unknown) => {
                setActionError(getErrorMessage(error, 'Failed to save media.'));
              });
            },
          } satisfies MenuActionNode;
        }),
      });
    }

    messageActions.push({ kind: 'separator', key: 'separator-report' });
    messageActions.push({
      kind: 'item',
      key: 'report',
      label: 'Report',
      disabled: !canCreateReports,
      onSelect: () => {
        setReportDialogMessageId(message.id);
        setReportTarget('server_admins');
        setReportKind('content_abuse');
        setReportComment('');
        setActionError(null);
      },
    });

    const authorAvatarInitial = authorLabel.trim().charAt(0).toUpperCase() || 'U';
    const authorIdentity = (
      <div className={`flex items-center gap-2 min-w-0 ${canProfileMenu ? 'cursor-pointer' : ''}`}>
        <Avatar size="sm">
          {authorProfile?.avatarUrl && <AvatarImage src={authorProfile.avatarUrl} alt={authorLabel} />}
          <AvatarFallback>{authorAvatarInitial}</AvatarFallback>
        </Avatar>
        <span
          className={`font-semibold text-[15px] truncate ${canProfileMenu ? 'hover:underline underline-offset-2' : ''}`}
          style={{ color: authorColor }}
        >
          {authorLabel}
        </span>
      </div>
    );

    return (
      <ContextMenu
        onOpenChange={(nextOpen) => {
          traceContextMenuEvent('message', 'open-change', { messageId: message.id, open: nextOpen });
        }}
      >
        <ContextMenuTrigger
          asChild
          onContextMenu={(event) => {
            const intent = resolveContextMenuIntent(event.target);
            traceContextMenuEvent('message', 'contextmenu-trigger', {
              messageId: message.id,
              intent,
            });

            if (intent === 'entity_profile') {
              event.preventDefault();
              return;
            }

            if (intent === 'native_text') {
              event.stopPropagation();
            }
          }}
        >
          <div
            data-menu-scope="message"
            className={`group rounded-md border bg-[#16263d] border-[#2b4263] px-3 py-2 transition-colors hover:bg-[#1b2f4a] hover:border-[#3d5f8d] ${
              isReply ? 'border-l-2 border-l-[#4c74a6]' : ''
            }`}
            style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {canProfileMenu && message.author_user_id ? (
                  <ProfileContextMenu
                    userId={message.author_user_id}
                    username={authorLabel}
                    avatarUrl={authorProfile?.avatarUrl ?? null}
                    canReport={canCreateReports && message.author_user_id !== currentUserId}
                    canBan={canManageBans && message.author_user_id !== currentUserId}
                    onDirectMessage={onDirectMessageUser}
                    onReport={(targetUserId) => {
                      void reportProfile(targetUserId);
                    }}
                    onBan={(targetUserId, communityId) => {
                      openBanDialog(targetUserId, communityId);
                    }}
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
                <span className="text-xs text-[#8897b1] shrink-0">
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu
                  onOpenChange={(nextOpen) => {
                    traceContextMenuEvent('message', 'overflow-open-change', {
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
                  <DropdownMenuContent align="end" className="bg-[#18243a] border-[#304867] text-white">
                    <ActionMenuContent mode="dropdown" scope="message" actions={messageActions} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editingContent}
                  onChange={(event) => setEditingContent(event.target.value)}
                  className="bg-[#142033] border-[#304867] text-white"
                  maxLength={4000}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const nextContent = editingContent.trim();
                      if (!nextContent) {
                        setActionError('Message content is required.');
                        return;
                      }
                      setActionBusyMessageId(message.id);
                      void onEditMessage(message.id, nextContent)
                        .then(() => {
                          setEditingMessageId(null);
                          setEditingContent('');
                        })
                        .catch((error: unknown) => {
                          setActionError(getErrorMessage(error, 'Failed to edit message.'));
                        })
                        .finally(() => {
                          setActionBusyMessageId((prev) => (prev === message.id ? null : prev));
                        });
                    }}
                    disabled={actionBusyMessageId === message.id}
                    className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingMessageId(null);
                      setEditingContent('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {!hideMediaPlaceholder && (
                  <div className="text-[#e6edf7] text-[15px] leading-[1.375] break-words">
                    {renderLinkifiedMessageText(message.content)}
                  </div>
                )}

                {messageLinkPreviewRow?.status === 'pending' && (
                  <div className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-[#8ea4c7]">Link preview</p>
                    <p className="text-xs text-[#a9b8cf]">Fetching preview...</p>
                  </div>
                )}

                {messageLinkPreviewRow?.status === 'ready' && messageLinkPreviewRow.snapshot && (
                  <div className="space-y-2">
                    {messageLinkPreviewRow.snapshot.embed ? (
                      (() => {
                        const embedUrl = getRenderableEmbedUrl(messageLinkPreviewRow);
                        if (!embedUrl) return null;

                        return (
                          <div className="space-y-2">
                            <div className="overflow-hidden rounded-md border border-[#304867] bg-[#0d1626]">
                              <div
                                className="w-full bg-[#0d1626]"
                                style={{
                                  aspectRatio: String(messageLinkPreviewRow.snapshot.embed?.aspectRatio || 16 / 9),
                                }}
                              >
                                <iframe
                                src={embedUrl}
                                title={messageLinkPreviewRow.snapshot.title ?? 'Embedded video'}
                                className="h-full w-full"
                                loading="lazy"
                                // YouTube returns error 153 when no referrer/client identity is provided.
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
                                    messageLinkPreviewRow.snapshot.canonicalUrl ??
                                    messageLinkPreviewRow.snapshot.sourceUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="block border-t border-[#304867] bg-[#142033] px-3 py-2 hover:bg-[#182740] transition-colors"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {messageLinkPreviewRow.snapshot.siteName && (
                                      <span className="shrink-0 rounded-sm bg-[#223754] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a8c4ea]">
                                        {messageLinkPreviewRow.snapshot.siteName}
                                      </span>
                                    )}
                                    {messageLinkPreviewRow.snapshot.title && (
                                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white leading-tight">
                                        {messageLinkPreviewRow.snapshot.title}
                                      </p>
                                    )}
                                    <span className="shrink-0 text-[11px] text-[#8ea4c7]">Open</span>
                                  </div>
                                  {messageLinkPreviewRow.snapshot.description && (
                                    <p className="mt-1 text-xs text-[#bfd0ea] leading-snug max-h-8 overflow-hidden">
                                      {messageLinkPreviewRow.snapshot.description}
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
                        href={messageLinkPreviewRow.snapshot.canonicalUrl ?? messageLinkPreviewRow.snapshot.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block rounded-md border border-[#304867] bg-[#142033] hover:bg-[#1a2943] transition-colors overflow-hidden"
                      >
                        {messageLinkPreviewRow.snapshot.thumbnail?.signedUrl && (
                          <img
                            src={messageLinkPreviewRow.snapshot.thumbnail.signedUrl}
                            alt={messageLinkPreviewRow.snapshot.title ?? 'Link preview'}
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
                      const attachmentLabel = attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'media';
                      const expiresAtLabel = new Date(attachment.expiresAt).toLocaleString();

                      if (attachment.mediaKind === 'image' && attachment.signedUrl) {
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

                      if (attachment.mediaKind === 'video' && attachment.signedUrl) {
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
                            <span className="text-sm text-[#a9b8cf]">{attachmentLabel}</span>
                          )}
                          <p className="text-[11px] text-[#8ea4c7]">Expires {expiresAtLabel}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {reactionSummaries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {reactionSummaries.map(([emoji, summary]) => {
                      const reactionKey = `${message.id}:${emoji}`;
                      const isBusy = Boolean(reactionBusyKeys[reactionKey]);
                      return (
                        <Button
                          key={reactionKey}
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => {
                            void toggleReaction(message.id, emoji);
                          }}
                          className={`h-6 rounded-full border px-2 text-xs ${
                            summary.reactedByCurrentUser
                              ? 'border-[#3f79d8] bg-[#3f79d8]/20 text-[#dbe9ff]'
                              : 'border-[#304867] bg-[#142033] text-[#b8c7dd] hover:text-white'
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
          <ActionMenuContent mode="context" scope="message" actions={messageActions} />
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderMessageTree = (message: Message, depth = 0, ancestorIds = new Set<string>()) => {
    const replies = replyTree.repliesByParentId.get(message.id) ?? [];
    const repliesExpanded = Boolean(expandedReplyThreads[message.id]);
    const nextAncestorIds = new Set(ancestorIds);
    nextAncestorIds.add(message.id);
    const renderableReplies = replies.filter((reply) => !nextAncestorIds.has(reply.id));

    return (
      <div key={message.id} className="space-y-2">
        {renderMessageRow(message, depth)}

        {renderableReplies.length > 0 && (
          <div className="ml-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpandedReplyThreads((prev) => ({
                  ...prev,
                  [message.id]: !repliesExpanded,
                }))
              }
              className="text-[#8ea4c7] hover:text-white hover:bg-[#22334f]"
            >
              {repliesExpanded
                ? `Hide replies (${renderableReplies.length})`
                : `View replies (${renderableReplies.length})`}
            </Button>
          </div>
        )}

        {repliesExpanded &&
          renderableReplies.map((reply) => renderMessageTree(reply, depth + 1, nextAncestorIds))}
      </div>
    );
  };

  useEffect(() => {
    if (replyTree.rootMessages.length === 0) return;
    if (!shouldScrollToBottomOnNextDataRef.current) return;
    void Promise.resolve().then(() => {
      if (!virtuosoRef.current) return;
      virtuosoRef.current.scrollToIndex({
        index: replyTree.rootMessages.length - 1,
        align: 'end',
        behavior: 'auto',
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
          computeItemKey={(_index, message) => message.id}
          atBottomStateChange={(atBottom) => {
            isAtBottomRef.current = atBottom;
          }}
          followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
          startReached={handleStartReached}
          increaseViewportBy={{ top: 400, bottom: 600 }}
          components={{
            Header: () =>
              isLoadingOlderMessages || hasOlderMessages ? (
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center justify-center">
                    <div className="rounded-full border border-[#304867] bg-[#142033] px-3 py-1 text-[11px] text-[#9fb4d5]">
                      {isLoadingOlderMessages
                        ? 'Loading older messages...'
                        : 'Scroll up to load older messages'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-4" />
              ),
            Footer: () => <div className="h-4" />,
          }}
          itemContent={(_index, message) => (
            <div className="px-4 pb-4">{renderMessageTree(message)}</div>
          )}
        />
      </div>

      <Dialog
        open={Boolean(profileReportDraft)}
        onOpenChange={(open) => {
          if (open) return;
          setProfileReportDraft(null);
          setProfileReportReason('');
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
              Target:{' '}
              <span className="font-semibold text-white">
                {profileReportDraft?.username ?? 'Unknown user'}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Reason (required)</label>
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
                setProfileReportReason('');
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
                  setActionError('Report reason is required.');
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
                    setProfileReportReason('');
                  })
                  .catch((error: unknown) => {
                    setActionError(getErrorMessage(error, 'Failed to submit profile report.'));
                  })
                  .finally(() => {
                    setProfileReportSubmitting(false);
                  });
              }}
              disabled={profileReportSubmitting}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {profileReportSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reportDialogMessageId)} onOpenChange={(open) => !open && setReportDialogMessageId(null)}>
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Report Message</DialogTitle>
            <DialogDescription className="text-[#a9b8cf]">
              Route this report to moderators now, while keeping structured data ready for future moderation automation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Destination</label>
              <select
                value={reportTarget}
                onChange={(event) => setReportTarget(event.target.value as MessageReportTarget)}
                className="w-full rounded-md border border-[#304867] bg-[#142033] px-3 py-2 text-sm text-white"
              >
                <option value="server_admins">Server admins only</option>
                <option value="haven_developers">Haven developers only</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Type</label>
              <select
                value={reportKind}
                onChange={(event) => setReportKind(event.target.value as MessageReportKind)}
                className="w-full rounded-md border border-[#304867] bg-[#142033] px-3 py-2 text-sm text-white"
              >
                <option value="content_abuse">Report Content Abuse</option>
                <option value="bug">Report Bug</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Comment</label>
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
                    setActionError(getErrorMessage(error, 'Failed to submit message report.'));
                  })
                  .finally(() => {
                    setReportSubmitting(false);
                  });
              }}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {reportSubmitting ? 'Submitting...' : 'Submit report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(banDraft)}
        onOpenChange={(open) => {
          if (open) return;
          setBanDraft(null);
          setBanReason('');
          setBanSubmitting(false);
          setBanConfirmOpen(false);
        }}
      >
        <DialogContent className="bg-[#18243a] border-[#304867] text-white">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription className="text-[#a9b8cf]">
              Bans remove server access immediately and block rejoin until unbanned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-[#c7d5ea]">
              Target:{' '}
              <span className="font-semibold text-white">
                {banDraft?.username ?? 'Unknown user'}
              </span>
            </p>
            <label className="text-xs uppercase tracking-wide text-[#a9b8cf]">Reason (required)</label>
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
                setBanReason('');
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
                  setActionError('Ban reason is required.');
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
              This action is immediate. Confirm banning this user from the selected server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={banSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={banSubmitting || !banDraft}
              onClick={() => {
                if (!banDraft) return;
                const normalizedReason = banReason.trim();
                if (!normalizedReason) {
                  setActionError('Ban reason is required.');
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
                    setBanReason('');
                  })
                  .catch((error: unknown) => {
                    setActionError(getErrorMessage(error, 'Failed to ban user.'));
                  })
                  .finally(() => {
                    setBanSubmitting(false);
                  });
              }}
            >
              {banSubmitting ? 'Banning...' : 'Ban User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {actionError && <p className="px-4 pb-2 text-xs text-red-400">{actionError}</p>}
    </>
  );
}
