import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Database } from '@/types/database';
import { getErrorMessage } from '@/shared/lib/errors';
import type {
  MessageAttachment,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from '@/lib/backend/types';

type Message = Database['public']['Tables']['messages']['Row'];
const QUICK_REACTION_EMOJI = ['👍', '❤️', '😂', '🎉'] as const;
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
};

interface MessageListProps {
  channelId: string;
  messages: Message[];
  messageReactions: MessageReaction[];
  messageAttachments: MessageAttachment[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
  canManageMessages: boolean;
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

export function MessageList({
  channelId,
  messages,
  messageReactions,
  messageAttachments,
  authorProfiles,
  currentUserId,
  canManageMessages,
  onDeleteMessage,
  onEditMessage,
  onToggleMessageReaction,
  onReplyToMessage,
  onReportMessage,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const renderMessageRow = (message: Message, depth = 0) => {
    const authorProfile = message.author_user_id ? authorProfiles[message.author_user_id] : undefined;
    const isStaffUserMessage = message.author_type === 'user' && Boolean(authorProfile?.isPlatformStaff);
    const isOwnMessage = message.author_type === 'user' && message.author_user_id === currentUserId;
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
    const trimmedMessageContent = message.content.trim();
    const isInvisibleMediaPlaceholder = /^[\u200B\u200C\u200D\uFEFF]+$/.test(message.content);
    const hideMediaPlaceholder =
      messageAttachmentRows.length > 0 &&
      (/^\[(media|image|file)\]$/i.test(trimmedMessageContent) || isInvisibleMediaPlaceholder);

    return (
      <div
        className={`group rounded-md ${isReply ? 'border-l border-[#304867] pl-3 pt-2' : ''}`}
        style={isReply ? { marginLeft: `${replyIndent}px` } : undefined}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold text-[15px] truncate" style={{ color: authorColor }}>
              {authorLabel}
            </span>
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
            <DropdownMenu>
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
                {canEditMessage && (
                  <DropdownMenuItem
                    onClick={() => {
                      setActionError(null);
                      setEditingMessageId(message.id);
                      setEditingContent(message.content);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                )}
                {canDeleteMessage && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setActionError(null);
                      setActionBusyMessageId(message.id);
                      void onDeleteMessage(message.id)
                        .catch((error: unknown) => {
                          setActionError(getErrorMessage(error, 'Failed to delete message.'));
                        })
                        .finally(() => {
                          setActionBusyMessageId((prev) => (prev === message.id ? null : prev));
                        });
                    }}
                    disabled={actionBusyMessageId === message.id}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    onReplyToMessage({
                      id: message.id,
                      authorLabel,
                      preview: message.content,
                    })
                  }
                >
                  Reply
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {QUICK_REACTION_EMOJI.map((emoji) => {
                  const reactionKey = `${message.id}:${emoji}`;
                  return (
                    <DropdownMenuItem
                      key={reactionKey}
                      onClick={() => {
                        void toggleReaction(message.id, emoji);
                      }}
                      disabled={Boolean(reactionBusyKeys[reactionKey])}
                    >
                      React {emoji}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setReportDialogMessageId(message.id);
                    setReportTarget('server_admins');
                    setReportKind('content_abuse');
                    setReportComment('');
                    setActionError(null);
                  }}
                >
                  Report
                </DropdownMenuItem>
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
                {message.content}
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

  return (
    <>
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="space-y-4 p-4">
          {replyTree.rootMessages.map((message) => renderMessageTree(message))}
        </div>
      </ScrollArea>

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

      {actionError && <p className="px-4 pb-2 text-xs text-red-400">{actionError}</p>}
    </>
  );
}
