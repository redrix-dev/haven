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
import type { MessageReportKind, MessageReportTarget } from '@/lib/backend/types';

type Message = Database['public']['Tables']['messages']['Row'];
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
};

interface MessageListProps {
  messages: Message[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
  canManageMessages: boolean;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
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
  messages,
  authorProfiles,
  currentUserId,
  canManageMessages,
  onDeleteMessage,
  onEditMessage,
  onReplyToMessage,
  onReportMessage,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedReplyThreads, setExpandedReplyThreads] = useState<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusyMessageId, setActionBusyMessageId] = useState<string | null>(null);
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

  const messageById = useMemo(() => {
    const next = new Map<string, Message>();
    for (const message of messages.filter(canCurrentUserViewMessage)) {
      next.set(message.id, message);
    }
    return next;
  }, [messages]);

  const replyGroups = useMemo(() => {
    const repliesByParentId = new Map<string, Message[]>();
    const topLevelMessages: Message[] = [];

    for (const message of messages.filter(canCurrentUserViewMessage)) {
      const parentId = getReplyToMessageId(message);
      if (!parentId || !messageById.has(parentId)) {
        topLevelMessages.push(message);
        continue;
      }

      const existing = repliesByParentId.get(parentId) ?? [];
      existing.push(message);
      repliesByParentId.set(parentId, existing);
    }

    return { topLevelMessages, repliesByParentId };
  }, [messageById, messages]);

  const renderMessageRow = (message: Message, isReply = false) => {
    const authorProfile = message.author_user_id ? authorProfiles[message.author_user_id] : undefined;
    const isStaffUserMessage = message.author_type === 'user' && Boolean(authorProfile?.isPlatformStaff);
    const isOwnMessage = message.author_type === 'user' && message.author_user_id === currentUserId;
    const canDeleteMessage = isOwnMessage || canManageMessages;
    const canEditMessage = isOwnMessage;
    const authorLabel = getAuthorLabel(message, authorProfile, currentUserId);
    const authorColor = getAuthorColor(message, authorProfile, currentUserId);
    const isEditing = editingMessageId === message.id;

    return (
      <div
        key={message.id}
        className={`group rounded-md ${isReply ? 'ml-5 border-l border-[#304867] pl-3 pt-2' : ''}`}
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
          <div className="text-[#e6edf7] text-[15px] leading-[1.375] break-words">{message.content}</div>
        )}
      </div>
    );
  };

  return (
    <>
      <ScrollArea className="flex-1 p-4">
        <div ref={scrollRef} className="space-y-4">
          {replyGroups.topLevelMessages.map((message) => {
            const replies = replyGroups.repliesByParentId.get(message.id) ?? [];
            const repliesExpanded = Boolean(expandedReplyThreads[message.id]);

            return (
              <div key={message.id} className="space-y-2">
                {renderMessageRow(message)}

                {replies.length > 0 && (
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
                        ? `Hide replies (${replies.length})`
                        : `View replies (${replies.length})`}
                    </Button>
                  </div>
                )}

                {repliesExpanded && replies.map((reply) => renderMessageRow(reply, true))}
              </div>
            );
          })}
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
