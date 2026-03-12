import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal, BellOff, Bell, ShieldOff, X, AlertTriangle } from 'lucide-react';
import type { DirectMessage } from '@shared/lib/backend/types';
import { MobileMessageComposer } from './MobileMessageComposer';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { useMobileLongPress } from '@web-mobile/mobile/useMobileLongPress';
import { isNearBottom } from '@web-mobile/mobile/scrollAnchor';
import { MarkdownText } from '@shared/lib/markdownRenderer';

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
  onSendMessage: (content: string) => Promise<void>;
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
  const longPress = useMobileLongPress();
  const justSentRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (hasInitializedScrollRef.current) return;
    hasInitializedScrollRef.current = true;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

// Effect 2 — handles scroll on new messages
  useEffect(() => {
    if (!hasInitializedScrollRef.current) return;
    const node = scrollRef.current;
    if (!node) return;

    requestAnimationFrame(() => {
      if (justSentRef.current) {
        justSentRef.current = false;
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        return;
      }
      if (isNearBottom(node)) {
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
      }
    });
}, [messages.length]);

  const handleSend = async (_mediaAttachment?: { file: File; expiresInHours: number }) => {
    const content = draft.trim();
    if (!content || sendPending) return;
    justSentRef.current = true;
    setDraft('');
    await onSendMessage(content);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Derive the other user from any non-own message for block action
  const otherUser = messages.find((m) => m.authorUserId !== currentUserId);
  const otherUserId = otherUser?.authorUserId ?? null;
  const otherUsername = otherUser?.authorUsername ?? 'this user';

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
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

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 pb-4">
        {error && (
          <p className="text-red-400 text-xs text-center py-2">{error}</p>
        )}

        {messages.map((message) => {
          const isOwn = message.authorUserId === currentUserId;
          const name = message.authorUsername ?? 'Unknown';
          const initial = name.charAt(0).toUpperCase();
          const dateLabel = formatDate(message.createdAt);
          const showDateSep = dateLabel !== lastDateLabel;
          if (showDateSep) lastDateLabel = dateLabel;

          return (
            <React.Fragment key={message.messageId}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-gray-500 text-[11px] font-medium shrink-0">{dateLabel}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              <div
                className={`flex gap-2.5 mb-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                {...longPress.bind(() => {
                  setContextMenu({ message, isOwn });
                })}
              >
                {!isOwn && (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 overflow-hidden">
                    {message.authorAvatarUrl ? (
                      <img src={message.authorAvatarUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      initial
                    )}
                  </div>
                )}

                <div className={`flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[11px] font-semibold text-gray-300 truncate max-w-[120px]">
                      {isOwn ? 'You' : name}
                    </span>
                    <span className="text-[10px] text-gray-600 shrink-0">
                      {formatTime(message.createdAt)}
                    </span>
                    {message.editedAt && (
                      <span className="text-[10px] text-gray-600">(edited)</span>
                    )}
                  </div>

                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                      isOwn
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-[#1a2840] text-gray-100 rounded-tl-sm border border-white/5'
                    }`}
                  >
                    <MarkdownText content={message.content} />
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <MobileMessageComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        sending={sendPending}
        placeholder="Message..."
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
          <div className="fixed inset-0 z-40 bg-black/60 touch-none overscroll-none" onClick={() => setOptionsOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10"
            style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <p className="text-sm font-semibold text-white">Conversation Options</p>
              <button onClick={() => setOptionsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
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
          <div className="fixed inset-0 z-50 bg-black/70 touch-none overscroll-none" onClick={() => setBlockConfirmOpen(false)} />
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
