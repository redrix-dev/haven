import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal, BellOff, Bell, ShieldOff, X, AlertTriangle, RefreshCcw } from 'lucide-react';
import type { DirectMessage } from '@/lib/backend/types';
import { MobileMessageComposer } from './MobileMessageComposer';
import { MobileLongPressMenu } from './MobileLongPressMenu';
import { useMobilePullToRefresh } from '@/renderer/mobile/useMobilePullToRefresh';

interface ContextMenuState {
  message: DirectMessage;
  isOwn: boolean;
}

interface MobileDmConversationViewProps {
  currentUserId: string;
  conversationTitle?: string;
  messages: DirectMessage[];
  loading: boolean;
  refreshing: boolean;
  sendPending: boolean;
  error: string | null;
  isMuted: boolean;
  onSendMessage: (content: string) => Promise<void>;
  onRefresh: () => void;
  onMuteToggle: (nextMuted: boolean) => Promise<void>;
  onBlock: (input: { userId: string; username: string }) => Promise<void>;
  onReportMessage: (messageId: string) => void;
}

export function MobileDmConversationView({
  currentUserId,
  conversationTitle,
  messages,
  loading,
  refreshing,
  sendPending,
  error,
  isMuted,
  onSendMessage,
  onRefresh,
  onMuteToggle,
  onBlock,
  onReportMessage,
}: MobileDmConversationViewProps) {
  const [draft, setDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    scrollRef,
    pullDistance,
    pullProgress,
    showIndicator,
    bind,
  } = useMobilePullToRefresh({
    refreshing,
    onRefresh,
    disabled: loading,
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sendPending) return;
    setDraft('');
    await onSendMessage(content);
  };

  const startLongPress = (message: DirectMessage, isOwn: boolean) => {
    pressTimerRef.current = setTimeout(() => {
      setContextMenu({ message, isOwn });
    }, 450);
  };

  const cancelLongPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
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

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#142033]/90 shadow-sm transition-opacity duration-150 ${
              showIndicator ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `translateY(${showIndicator ? Math.max(pullDistance - 20, 0) : 0}px)`,
            }}
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            ) : (
              <RefreshCcw
                className="w-4 h-4 text-blue-400 transition-transform duration-75"
                style={{ transform: `rotate(${pullProgress * 180}deg)` }}
              />
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-2" {...bind}>
          <div
            style={{
              transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
              transition: pullDistance === 0 ? 'transform 180ms ease-out' : undefined,
            }}
          >
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
                    onPointerDown={() => startLongPress(message, isOwn)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
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
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          isOwn
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : 'bg-[#1a2840] text-gray-100 rounded-tl-sm border border-white/5'
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={listEndRef} />
          </div>
        </div>
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
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOptionsOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#0d1525] border-t border-white/10 pb-8">
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
          <div className="fixed inset-0 z-50 bg-black/70" onClick={() => setBlockConfirmOpen(false)} />
          <div className="fixed inset-x-4 bottom-8 z-60 rounded-2xl bg-[#18243a] border border-white/10 p-5">
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
