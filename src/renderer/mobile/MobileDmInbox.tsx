import React from 'react';
import { Loader2, RefreshCcw, BellOff, PencilLine } from 'lucide-react';
import type { DirectMessageConversationSummary } from '@/lib/backend/types';
import { useMobilePullToRefresh } from '@/renderer/mobile/useMobilePullToRefresh';

interface MobileDmInboxProps {
  conversations: DirectMessageConversationSummary[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  currentUserId: string;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: (options?: { suppressLoadingState?: boolean }) => void;
  onCompose: () => void;
}

function formatConversationTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function MobileDmInbox({
  conversations,
  loading,
  refreshing,
  error,
  currentUserId: _currentUserId,
  onSelectConversation,
  onRefresh,
  onCompose,
}: MobileDmInboxProps) {
  const {
    scrollRef,
    pullDistance,
    pullProgress,
    showIndicator,
    bind,
  } = useMobilePullToRefresh({
    refreshing,
    onRefresh: () => onRefresh({ suppressLoadingState: true }),
    disabled: loading || conversations.length === 0,
  });

  if (loading && conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-gray-500 text-sm text-center">{error}</p>
        <button
          onClick={() => onRefresh()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6">
        <p className="text-gray-500 text-sm text-center">No direct messages yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Inbox header with compose button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-sm font-semibold text-gray-300">Direct Messages</span>
        <button
          onClick={onCompose}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          title="New message"
        >
          <PencilLine className="w-4 h-4 text-gray-300" />
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" {...bind}>
          <div
            className="min-h-full"
            style={{
              transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
              transition: pullDistance === 0 ? 'transform 180ms ease-out' : undefined,
            }}
          >
            {conversations.map((convo) => {
              const name = convo.otherUsername ?? 'Unknown User';
              const initial = name.charAt(0).toUpperCase();
              const hasUnread = convo.unreadCount > 0;
              const timeLabel = formatConversationTime(convo.lastMessageAt ?? convo.updatedAt);

              return (
                <button
                  key={convo.conversationId}
                  onClick={() => onSelectConversation(convo.conversationId)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/5"
                >
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0 overflow-hidden">
                    {convo.otherAvatarUrl ? (
                      <img src={convo.otherAvatarUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      initial
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`text-sm truncate ${hasUnread ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {convo.isMuted && <BellOff className="w-3 h-3 text-gray-600" />}
                        {timeLabel && (
                          <span className="text-[10px] text-gray-500">{timeLabel}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${hasUnread ? 'text-gray-300' : 'text-gray-500'}`}>
                        {convo.lastMessagePreview ?? 'No messages yet'}
                      </p>
                      {hasUnread && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0 leading-none">
                          {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
