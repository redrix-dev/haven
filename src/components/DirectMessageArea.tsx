import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { DmReportModal, type DmReportTarget } from '@/components/DmReportModal';
import type {
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
} from '@/lib/backend/types';
import { Flag, RefreshCcw, Send, ShieldBan, Volume2, VolumeX } from 'lucide-react';

type DirectMessageAreaProps = {
  currentUserId: string;
  currentUserDisplayName: string;
  conversation: DirectMessageConversationSummary | null;
  messages: DirectMessage[];
  loading: boolean;
  sending: boolean;
  refreshing?: boolean;
  error: string | null;
  onRefresh: () => void;
  onSendMessage: (content: string) => Promise<void>;
  onToggleMute: (muted: boolean) => Promise<void>;
  onBlockUser: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (input: { messageId: string; kind: DirectMessageReportKind; comment: string }) => Promise<void>;
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

export function DirectMessageArea({
  currentUserId,
  currentUserDisplayName,
  conversation,
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
  const [draft, setDraft] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);
  const [blockingUser, setBlockingUser] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<DmReportTarget | null>(null);
  const [pendingBlockConfirm, setPendingBlockConfirm] = React.useState<{
    userId: string;
    username: string;
  } | null>(null);
  const scrollAreaRootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setDraft('');
    setActionError(null);
    setActionNotice(null);
    setBlockingUser(false);
    setReportTarget(null);
    setPendingBlockConfirm(null);
  }, [conversation?.conversationId]);

  React.useEffect(() => {
    const viewport = scrollAreaRootRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, conversation?.conversationId]);

  const handleSend = async () => {
    const next = draft.trim();
    if (!next || !conversation) return;
    setActionError(null);
    setActionNotice(null);
    try {
      await onSendMessage(next);
      setDraft('');
    } catch (error) {
      setActionError(getUiErrorMessage(error, 'Failed to send DM.'));
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void handleSend();
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
    } catch (error) {
      setActionError(getUiErrorMessage(error, 'Failed to block user.'));
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
        <div className="flex items-center justify-between gap-3">
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
                void onToggleMute(!conversation.isMuted).catch((error) => {
                  setActionError(getUiErrorMessage(error, 'Failed to update mute.'));
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
              onClick={() => {
                handleBlockUser();
              }}
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
              <p className="text-sm text-[#a9b8cf]">Loading messages...</p>
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
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#dbe7f8]">
                          {message.content}
                        </p>
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
                                  messagePreview: message.content,
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
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={`Message ${title}`}
            className="min-h-[84px] resize-y bg-[#111a2b] border-[#304867] text-white placeholder:text-[#89a1c3]"
            disabled={sending}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#8ea4c7]">Enter sends • Shift+Enter for newline</p>
            <Button type="button" onClick={() => void handleSend()} disabled={sending || !draft.trim()}>
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
