import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/components/ui/avatar';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/components/ui/alert-dialog';
import { ScrollArea } from '@shared/components/ui/scroll-area';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Textarea } from '@shared/components/ui/textarea';
import { DmReportModal, type DmReportTarget } from '@shared/components/DmReportModal';
import type {
  DirectMessage,
  DirectMessageAttachment,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from '@shared/lib/backend/types';
import {
  Flag,
  ImagePlus,
  RefreshCcw,
  Send,
  ShieldBan,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MarkdownText } from '@shared/lib/markdownRenderer';
import {
  DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT,
  getDirectMessagePreviewText,
  getVisibleDirectMessageText,
} from '@shared/lib/backend/directMessageUtils';
import { useDmStore } from '@shared/stores/dmStore';

type DirectMessageAreaProps = {
  currentUserId: string;
  currentUserDisplayName: string;
  messages: DirectMessage[];
  loading: boolean;
  sending: boolean;
  refreshing?: boolean;
  error: string | null;
  onRefresh: () => void;
  onSendMessage: (
    content: string,
    options?: {
      imageFile?: File;
      imageExpiresInHours?: number;
    }
  ) => Promise<void>;
  onToggleMute: (muted: boolean) => Promise<void>;
  onBlockUser: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }) => Promise<void>;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
};

const getInitial = (value: string | null) => value?.trim().charAt(0).toUpperCase() || 'D';

const getConversationErrorHint = (error: string | null) => {
  if (!error) return null;
  const normalized = error.toLowerCase();
  if (normalized.includes('friends list') || normalized.includes('already friends')) {
    return 'Direct messages are friends-only right now. Re-add the user as a friend to continue.';
  }
  if (normalized.includes('blocked')) {
    return 'This DM is unavailable because one of you has blocked the other.';
  }
  if (normalized.includes('do not have access') || normalized.includes('access')) {
    return 'You no longer have access to this conversation. It may have been removed or restricted.';
  }
  return null;
};

const getUiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
};

const getAttachmentLabel = (attachment: DirectMessageAttachment): string =>
  attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'image';

export function DirectMessageArea({
  currentUserId,
  currentUserDisplayName,
  messages,
  loading,
  sending,
  refreshing = false,
  error,
  onRefresh,
  onSendMessage,
  onToggleMute,
  onBlockUser,
  onReportMessage,
}: DirectMessageAreaProps) {
  const conversation = useDmStore((state) => state.currentConversation);
  const [draft, setDraft] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);
  const [blockingUser, setBlockingUser] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<DmReportTarget | null>(null);
  const [imageAttachment, setImageAttachment] = React.useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [imageExpiresInHours, setImageExpiresInHours] = React.useState(24);
  const [pendingBlockConfirm, setPendingBlockConfirm] = React.useState<{
    userId: string;
    username: string;
  } | null>(null);
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
    setDraft('');
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
    [clearImageAttachment]
  );

  React.useEffect(() => {
    const viewport = scrollAreaRootRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]'
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
        imageFile: imageAttachment?.file,
        imageExpiresInHours: imageAttachment ? imageExpiresInHours : undefined,
      });
      setDraft('');
      clearImageAttachment();
    } catch (sendError) {
      setActionError(getUiErrorMessage(sendError, 'Failed to send DM.'));
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
  };

  const handleSelectImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.currentTarget.value = '';
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
    const targetUsername = conversation.otherUsername?.trim() || 'this user';
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
      setActionError(getUiErrorMessage(blockError, 'Failed to block user.'));
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
    setActionNotice('DM report submitted to Haven.');
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#111a2b] text-[#a9b8cf]">
        <div className="rounded-md border border-dashed border-[#304867] bg-[#142033]/60 p-6 max-w-md text-center">
          <p className="text-white font-semibold">Select a direct message</p>
          <p className="mt-2 text-sm">
            Open a DM from the Friends panel, or select an existing thread from the DM list.
          </p>
        </div>
      </div>
    );
  }

  const title = conversation.otherUsername ?? 'Direct Message';
  const errorHint = getConversationErrorHint(error);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#111a2b]">
      <div className="h-16 px-4 border-b border-[#22334f] bg-[#142033] flex items-center">
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-10 rounded-xl border border-[#304867] bg-[#1b2a42]">
              {conversation.otherAvatarUrl && <AvatarImage src={conversation.otherAvatarUrl} alt={title} />}
              <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
                {getInitial(conversation.otherUsername)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{title}</p>
              <div className="flex items-center gap-2 text-xs text-[#9fb2cf]">
                <span>1:1 Direct Message</span>
                {conversation.isMuted && (
                  <Badge variant="outline" className="border-[#304867] text-[#cfe0ff]">
                    Muted
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[#304867] text-white"
              onClick={onRefresh}
              disabled={loading || refreshing}
            >
              <RefreshCcw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[#304867] text-white"
              onClick={() => {
                void onToggleMute(!conversation.isMuted).catch((toggleError) => {
                  setActionError(getUiErrorMessage(toggleError, 'Failed to update mute.'));
                });
              }}
            >
              {conversation.isMuted ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              {conversation.isMuted ? 'Unmute' : 'Mute'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-[#5f3544] text-[#ffd4df] hover:bg-[#341f2a]"
              onClick={handleBlockUser}
              disabled={blockingUser || !conversation.otherUserId}
            >
              <ShieldBan className="size-4" />
              {blockingUser ? 'Blocking...' : 'Block'}
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea ref={scrollAreaRootRef} className="h-full">
          <div className="p-4 space-y-3">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-md border border-[#304867] bg-[#142033] px-3 py-3"
                >
                  <div className="flex items-start gap-3">
                    <Skeleton className="size-9 rounded-xl bg-[#22334f]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-28 bg-[#22334f]" />
                        <Skeleton className="h-3 w-24 bg-[#1b2a42]" />
                      </div>
                      <Skeleton className="h-3 w-full bg-[#1b2a42]" />
                      <Skeleton className="h-3 w-5/6 bg-[#1b2a42]" />
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="rounded-md border border-[#5a2d3d] bg-[#2a1821] p-3">
                <p className="text-sm text-red-300">{error}</p>
                {errorHint && <p className="mt-1 text-xs text-[#ffd4df]">{errorHint}</p>}
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#304867] bg-[#142033]/60 p-4">
                <p className="text-sm text-[#a9b8cf]">No messages yet.</p>
                <p className="mt-1 text-xs text-[#90a5c4]">Say hi to start the conversation.</p>
              </div>
            ) : (
              messages.map((message) => {
                const isSelf = message.authorUserId === currentUserId;
                const visibleText = getVisibleDirectMessageText(
                  message.content,
                  message.attachments.length
                );
                const messagePreview =
                  getDirectMessagePreviewText(message.content, message.attachments.length) ??
                  DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT;

                return (
                  <div
                    key={message.messageId}
                    className={`rounded-md border px-3 py-3 ${
                      isSelf
                        ? 'border-[#355a95] bg-[#13233c]'
                        : 'border-[#304867] bg-[#142033]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="size-9 rounded-xl border border-[#304867] bg-[#1b2a42]">
                        {message.authorAvatarUrl && (
                          <AvatarImage src={message.authorAvatarUrl} alt={message.authorUsername} />
                        )}
                        <AvatarFallback className="rounded-xl bg-[#1b2a42] text-white text-xs">
                          {getInitial(message.authorUsername)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">
                            {isSelf ? `${currentUserDisplayName} (You)` : message.authorUsername}
                          </p>
                          <span className="text-xs text-[#8ea4c7]">{formatTimestamp(message.createdAt)}</span>
                          {message.editedAt && (
                            <Badge variant="outline" className="border-[#304867] text-[#a9b8cf]">
                              Edited
                            </Badge>
                          )}
                        </div>
                        {visibleText && (
                          <div className="mt-1 text-sm text-[#dbe7f8]">
                            <MarkdownText content={visibleText} />
                          </div>
                        )}
                        {message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {message.attachments.map((attachment) => {
                              const attachmentLabel = getAttachmentLabel(attachment);
                              const expiresAtLabel = new Date(attachment.expiresAt).toLocaleString();

                              return (
                                <div key={attachment.id} className="space-y-1">
                                  {attachment.signedUrl ? (
                                    <img
                                      src={attachment.signedUrl}
                                      alt={attachmentLabel}
                                      className="max-h-80 rounded-md border border-[#304867] bg-[#0d1626] object-contain"
                                    />
                                  ) : (
                                    <div className="rounded-md border border-dashed border-[#304867] bg-[#0d1626] px-3 py-2 text-xs text-[#a9b8cf]">
                                      Image unavailable
                                    </div>
                                  )}
                                  <p className="text-[11px] text-[#8ea4c7]">
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
                              className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                              onClick={() => {
                                setActionError(null);
                                setActionNotice(null);
                                setReportTarget({
                                  messageId: message.messageId,
                                  authorUsername: message.authorUsername,
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

      <div className="border-t border-[#22334f] bg-[#142033] p-3">
        <div className="space-y-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleSelectImage}
          />
          {imageAttachment && (
            <div className="rounded-md border border-[#304867] bg-[#111a2b] px-3 py-3">
              <div className="flex items-start gap-3">
                <img
                  src={imageAttachment.previewUrl}
                  alt={imageAttachment.file.name || 'Selected image'}
                  className="size-16 rounded-md border border-[#304867] object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-[#8ea4c7]">Image attached</p>
                  <p className="mt-1 text-sm text-white truncate">{imageAttachment.file.name}</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-[#a9b8cf]">
                    Expires
                    <select
                      value={imageExpiresInHours}
                      onChange={(event) => setImageExpiresInHours(Number(event.target.value))}
                      className="rounded border border-[#304867] bg-[#18243a] px-2 py-1 text-xs text-white"
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
                  className="text-[#a9b8cf] hover:text-white"
                  onClick={clearImageAttachment}
                  disabled={sending}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={`Message ${title}`}
            className="min-h-[84px] resize-y bg-[#111a2b] border-[#304867] text-white placeholder:text-[#89a1c3]"
            disabled={sending}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#304867] text-white"
                onClick={() => imageInputRef.current?.click()}
                disabled={sending}
              >
                <ImagePlus className="size-4" />
                Attach Image
              </Button>
              <p className="text-xs text-[#8ea4c7]">Enter sends; Shift+Enter for newline</p>
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
          {actionNotice && <p className="text-sm text-[#bfe1b8]">{actionNotice}</p>}
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
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Block User?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingBlockConfirm
                ? `Block "${pendingBlockConfirm.username}"? This removes the friendship, cancels pending requests, and blocks future DMs.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={blockingUser}
              className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]"
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
              {blockingUser ? 'Blocking...' : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
