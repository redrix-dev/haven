import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Loader2,
  MoreHorizontal,
  ShieldOff,
} from 'lucide-react';
import type { DirectMessage } from '@shared/lib/backend/types';
import { MarkdownText } from '@shared/lib/markdownRenderer';
import {
  DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT,
  getVisibleDirectMessageText,
} from '@shared/lib/backend/directMessageUtils';
import { MobilePopoverCard, MobileSheet, MobileSheetCloseButton, MobileSheetHandle, MobileSheetHeader, MobileSheetTitle } from '@web-mobile/mobile/layout/MobileSurfacePrimitives';
import { MobileSceneScaffold } from '@web-mobile/mobile/layout/MobileSceneScaffold';
import { useMobileViewport } from '@web-mobile/mobile/layout/MobileViewportContext';
import { scrollToBottom } from '@web-mobile/mobile/scrollAnchor';
import { useMobileScrollAnchor } from '@web-mobile/mobile/useMobileScrollAnchor';
import { useMobileLongPress } from '@web-mobile/mobile/useMobileLongPress';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { MobileMessageComposer } from './MobileMessageComposer';

interface ContextMenuState {
  message: DirectMessage;
  isOwn: boolean;
}

interface MobileDmConversationViewProps {
  currentUserId: string;
  conversationTitle?: string;
  messages: DirectMessage[];
  loading: boolean;
  sendPending: boolean;
  error: string | null;
  isMuted: boolean;
  onSendMessage: (
    content: string,
    options?: {
      imageFile?: File;
      imageExpiresInHours?: number;
    }
  ) => Promise<void>;
  onMuteToggle: (nextMuted: boolean) => Promise<void>;
  onBlock: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (messageId: string) => void;
}

export function MobileDmConversationView({
  currentUserId,
  conversationTitle,
  messages,
  loading,
  sendPending,
  error,
  isMuted,
  onSendMessage,
  onMuteToggle,
  onBlock,
  onReportMessage,
}: MobileDmConversationViewProps) {
  const [draft, setDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const hasInitializedScrollRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const longPress = useMobileLongPress();
  const justSentRef = useRef(false);
  const viewport = useMobileViewport();
  const {
    handleComposerBlur,
    handleComposerFocus,
    isNearBottomRef,
  } = useMobileScrollAnchor({
    dockRef,
    keyboardOpen: viewport.keyboardOpen,
    scrollRef,
    shellHeightPx: viewport.shellHeightPx,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    if (!hasInitializedScrollRef.current) {
      hasInitializedScrollRef.current = true;
      scrollToBottom(node);
      return;
    }

    requestAnimationFrame(() => {
      if (justSentRef.current) {
        justSentRef.current = false;
        scrollToBottom(node, { behavior: 'smooth' });
        return;
      }
      if (isNearBottomRef.current) {
        scrollToBottom(node, { behavior: 'smooth' });
      }
    });
  }, [isNearBottomRef, messages.length]);

  const handleSend = async (mediaAttachment?: { file: File; expiresInHours: number }) => {
    const content = draft.trim();
    if ((!content && !mediaAttachment) || sendPending) return;
    justSentRef.current = true;
    setDraft('');
    await onSendMessage(content, {
      imageFile: mediaAttachment?.file,
      imageExpiresInHours: mediaAttachment?.expiresInHours,
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const otherUser = messages.find((message) => message.authorUserId !== currentUserId);
  const otherUserId = otherUser?.authorUserId ?? null;
  const otherUsername = otherUser?.authorUsername ?? 'this user';
  const conversationHeader = (
    <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
      {conversationTitle ? (
        <div className="mr-2 min-w-0">
          <p className="mb-0.5 text-[10px] font-semibold uppercase leading-none tracking-widest text-gray-500">
            Direct Message
          </p>
          <p className="truncate text-sm font-medium text-white">{conversationTitle}</p>
        </div>
      ) : (
        <div />
      )}
      <button
        onClick={() => setOptionsOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:bg-white/15"
      >
        <MoreHorizontal className="h-4 w-4 text-gray-400" />
      </button>
    </div>
  );

  if (loading && messages.length === 0) {
    return (
      <MobileSceneScaffold
        header={conversationHeader}
        body={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        }
      />
    );
  }

  let lastDateLabel = '';

  return (
    <MobileSceneScaffold
      header={conversationHeader}
      dockRef={dockRef}
      scrollRef={scrollRef}
      bodyClassName="px-3 py-2"
      body={
        <div className="min-h-full">
          {error && <p className="py-2 text-center text-xs text-red-400">{error}</p>}

          {messages.map((message) => {
            const isOwn = message.authorUserId === currentUserId;
            const name = message.authorUsername ?? 'Unknown';
            const initial = name.charAt(0).toUpperCase();
            const dateLabel = formatDate(message.createdAt);
            const showDateSeparator = dateLabel !== lastDateLabel;
            const visibleText = getVisibleDirectMessageText(
              message.content,
              message.attachments.length
            );
            if (showDateSeparator) {
              lastDateLabel = dateLabel;
            }

            return (
              <React.Fragment key={message.messageId}>
                {showDateSeparator && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="shrink-0 text-[11px] font-medium text-gray-500">
                      {dateLabel}
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                )}

                <div
                  className={`mb-3 flex gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                  {...longPress.bind(() => {
                    setContextMenu({ message, isOwn });
                  })}
                >
                  {!isOwn && (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-xs font-bold text-white">
                      {message.authorAvatarUrl ? (
                        <img
                          src={message.authorAvatarUrl}
                          alt={name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </div>
                  )}

                  <div
                    className={`flex max-w-[78%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`mb-1 flex items-baseline gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <span className="max-w-[120px] truncate text-[11px] font-semibold text-gray-300">
                        {isOwn ? 'You' : name}
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-600">
                        {formatTime(message.createdAt)}
                      </span>
                      {message.editedAt && (
                        <span className="text-[10px] text-gray-600">(edited)</span>
                      )}
                    </div>

                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                        isOwn
                          ? 'rounded-tr-sm bg-blue-600 text-white'
                          : 'rounded-tl-sm border border-white/5 bg-[#1a2840] text-gray-100'
                      }`}
                    >
                      {visibleText && <MarkdownText content={visibleText} />}
                      {message.attachments.length > 0 && (
                        <div className={visibleText ? 'mt-2 space-y-2' : 'space-y-2'}>
                          {message.attachments.map((attachment) => {
                            const attachmentLabel =
                              attachment.originalFilename ??
                              attachment.objectPath.split('/').pop() ??
                              'image';

                            return (
                              <div key={attachment.id} className="space-y-1">
                                {attachment.signedUrl ? (
                                  <img
                                    src={attachment.signedUrl}
                                    alt={attachmentLabel}
                                    className="max-h-72 rounded-xl border border-white/10 bg-black/20 object-contain"
                                  />
                                ) : (
                                  <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-xs text-gray-300">
                                    {DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      }
      dock={
        <MobileMessageComposer
          draft={draft}
          onDraftChange={setDraft}
          onFocus={handleComposerFocus}
          onBlur={handleComposerBlur}
          onSend={handleSend}
          sending={sendPending}
          placeholder="Message..."
          attachmentMode="images-only"
        />
      }
    >
      <MobileLongPressMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        isOwnMessage={contextMenu?.isOwn ?? false}
        canManageMessages={false}
        onReply={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onReport={() => {
          if (!contextMenu) return;
          onReportMessage(contextMenu.message.messageId);
        }}
      />

      <MobileSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        label="Conversation Options"
        id="mobile-dm-options"
        size="auto"
        className="h-auto"
      >
        <MobileSheetHandle />
        <MobileSheetHeader className="py-2">
          <MobileSheetTitle className="text-sm">Conversation Options</MobileSheetTitle>
          <MobileSheetCloseButton onClick={() => setOptionsOpen(false)} />
        </MobileSheetHeader>

        <div className="space-y-1 px-4 pb-[calc(var(--mobile-safe-bottom)+2rem)] pt-3">
          <button
            onClick={() => {
              setOptionsOpen(false);
              void onMuteToggle(!isMuted);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-white/5 active:bg-white/10"
          >
            {isMuted ? (
              <Bell className="h-5 w-5 shrink-0 text-gray-400" />
            ) : (
              <BellOff className="h-5 w-5 shrink-0 text-gray-400" />
            )}
            <div>
              <p className="text-sm text-gray-200">
                {isMuted ? 'Unmute conversation' : 'Mute conversation'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {isMuted
                  ? 'Re-enable notifications for this chat'
                  : 'Stop notifications for this chat'}
              </p>
            </div>
          </button>

          {otherUserId && (
            <button
              onClick={() => {
                setOptionsOpen(false);
                setBlockConfirmOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors hover:bg-red-500/10 active:bg-red-500/15"
            >
              <ShieldOff className="h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm text-red-300">Block {otherUsername}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  They won't be able to message you
                </p>
              </div>
            </button>
          )}
        </div>
      </MobileSheet>

      <MobilePopoverCard
        open={blockConfirmOpen && otherUserId !== null}
        onClose={() => setBlockConfirmOpen(false)}
        label="Block User"
        id="mobile-dm-block-confirm"
        className="bg-[#18243a]"
      >
        {otherUserId && (
          <div className="p-5">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <p className="font-semibold text-white">Block {otherUsername}?</p>
            </div>
            <p className="mb-5 text-sm text-gray-400">
              They won't be able to send you direct messages. You can unblock them later
              from your friends list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBlockConfirmOpen(false)}
                className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setBlockConfirmOpen(false);
                  void onBlock({ userId: otherUserId, username: otherUsername });
                }}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Block
              </button>
            </div>
          </div>
        )}
      </MobilePopoverCard>
    </MobileSceneScaffold>
  );
}
