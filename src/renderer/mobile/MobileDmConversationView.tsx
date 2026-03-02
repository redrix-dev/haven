// Changed: remove viewport-anchor hook usage to avoid stabilizer races, keep local focus snap behavior, and retain shared/skeleton/tap-target improvements.
import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, BellOff, Bell, ShieldOff, X, AlertTriangle } from 'lucide-react';
import type { DirectMessage } from '@/lib/backend/types';
import { MobileMessageComposer } from './MobileMessageComposer';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { useMobileLongPress } from '@/renderer/mobile/useMobileLongPress';
import { DateSeparator } from '@/renderer/shared/DateSeparator';
import { formatMessageDate, formatMessageTime } from '@/renderer/shared/dateFormatters';
import { MessageContent } from '@/renderer/shared/MessageContent';
import { AvatarBubble } from '@/renderer/shared/AvatarBubble';
import { Backdrop } from '@/renderer/shared/Backdrop';
import { MessageListSkeleton } from '@/renderer/mobile/skeletons/MessageListSkeleton';

interface ContextMenuState {
  message: DirectMessage;
  isOwn: boolean;
}

interface MobileDmConversationViewProps {
  currentUserId: string;
  currentUserDisplayName: string;
  conversationTitle?: string;
  messages: DirectMessage[];
  loading: boolean;
  sendPending: boolean;
  error: string | null;
  isMuted: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onMuteToggle: (nextMuted: boolean) => Promise<void>;
  onBlock: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (messageId: string) => void;
}

export function MobileDmConversationView({
  currentUserId,
  currentUserDisplayName,
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
  const isNearBottomRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const longPress = useMobileLongPress();

  const handleComposerFocus = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distFromBottom < 80) {
      requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
      });
    }
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    if (!hasInitializedScrollRef.current) {
      hasInitializedScrollRef.current = true;
      node.scrollTop = node.scrollHeight;
      return;
    }

    if (!isNearBottomRef.current) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [messages.length, scrollRef]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const handleScroll = () => {
      const nextBottomOffset = Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
      isNearBottomRef.current = nextBottomOffset <= 32;
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => node.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sendPending) return;
    setDraft('');
    await onSendMessage(content);
  };


  // Derive the other user from any non-own message for block action
  const otherUser = messages.find((m) => m.authorUserId !== currentUserId);
  const otherUserId = otherUser?.authorUserId ?? null;
  const otherUsername = otherUser?.authorUsername ?? 'this user';

  if (loading && messages.length === 0) {
    return <MessageListSkeleton />;
  }

  let lastDateLabel = '';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Conversation options bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 shrink-0">
        {conversationTitle ? (
          <div className="min-w-0 mr-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold leading-none mb-0.5">Direct Message</p>
            <p className="text-sm font-medium text-white truncate">{conversationTitle}</p>
          </div>
        ) : (
          <div />
        )}
        <button
          onClick={() => setOptionsOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors shrink-0"
        >
          <MoreHorizontal className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
        {error && (
          <p className="text-red-400 text-xs text-center py-2">{error}</p>
        )}

        {messages.map((message) => {
          const isOwn = message.authorUserId === currentUserId;
          const name = message.authorUsername ?? 'Unknown';
          const dateLabel = formatMessageDate(message.createdAt);
          const showDateSep = dateLabel !== lastDateLabel;
          if (showDateSep) lastDateLabel = dateLabel;

          return (
            <React.Fragment key={message.messageId}>
              {showDateSep && (
                <DateSeparator label={dateLabel} />
              )}

              <div
                className={`flex gap-2.5 mb-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                {...longPress.bind(() => {
                  setContextMenu({ message, isOwn });
                })}
              >
                {!isOwn && (
                  <AvatarBubble url={message.authorAvatarUrl} name={name} size="sm" className="mt-0.5" />
                )}

                <div className={`flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[11px] font-semibold text-gray-300 truncate max-w-[120px]">
                      {isOwn ? 'You' : name}
                    </span>
                    <span className="text-[10px] text-gray-600 shrink-0">
                      {formatMessageTime(message.createdAt)}
                    </span>
                    {message.editedAt && (
                      <span className="text-[10px] text-gray-600">(edited)</span>
                    )}
                  </div>

                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isOwn
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-[#1a2840] text-gray-100 rounded-tl-sm border border-white/5'
                    }`}
                  >
                    <MessageContent content={message.content} currentUserDisplayName={currentUserDisplayName} />
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div className="h-2 shrink-0" />
      </div>

      <MobileMessageComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        sending={sendPending}
        placeholder="Message..."
        onFocus={handleComposerFocus}
      />

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

      {/* ── Conversation options sheet ──────────────────────────────────── */}
      {optionsOpen && (
        <>
          <Backdrop onDismiss={() => setOptionsOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10"
            style={{ paddingBottom: 'calc(2rem + var(--sab))' }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <p className="text-sm font-semibold text-white">Conversation Options</p>
              <button onClick={() => setOptionsOpen(false)} className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="px-4 pt-3 space-y-1">
              {/* Mute / Unmute */}
              <button
                onClick={() => {
                  setOptionsOpen(false);
                  void onMuteToggle(!isMuted);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors text-left"
              >
                {isMuted ? (
                  <Bell className="w-5 h-5 text-gray-400 shrink-0" />
                ) : (
                  <BellOff className="w-5 h-5 text-gray-400 shrink-0" />
                )}
                <div>
                  <p className="text-sm text-gray-200">{isMuted ? 'Unmute conversation' : 'Mute conversation'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isMuted ? 'Re-enable notifications for this chat' : 'Stop notifications for this chat'}
                  </p>
                </div>
              </button>

              {/* Block */}
              {otherUserId && (
                <button
                  onClick={() => {
                    setOptionsOpen(false);
                    setBlockConfirmOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-red-500/10 active:bg-red-500/15 transition-colors text-left"
                >
                  <ShieldOff className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm text-red-300">Block {otherUsername}</p>
                    <p className="text-xs text-gray-500 mt-0.5">They won't be able to message you</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Block confirmation ──────────────────────────────────────────── */}
      {blockConfirmOpen && otherUserId && (
        <>
          <Backdrop zIndex="z-50" className="bg-black/70" onDismiss={() => setBlockConfirmOpen(false)} />
          <div className="mobile-bottom-card fixed inset-x-4 z-60 rounded-2xl bg-[#18243a] border border-white/10 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-white font-semibold">Block {otherUsername}?</p>
            </div>
            <p className="text-gray-400 text-sm mb-5">
              They won't be able to send you direct messages. You can unblock them later from your friends list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBlockConfirmOpen(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setBlockConfirmOpen(false);
                  void onBlock({ userId: otherUserId, username: otherUsername });
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors"
              >
                Block
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
