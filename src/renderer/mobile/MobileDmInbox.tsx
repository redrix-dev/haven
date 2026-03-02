// Changed: switch inbox to shared date/avatar utilities and improve compose tap target sizing.
import React from 'react';
import { Loader2, RefreshCcw, BellOff, PencilLine } from 'lucide-react';
import type { DirectMessageConversationSummary } from '@/lib/backend/types';
import { formatConversationTime } from '@/renderer/shared/dateFormatters';
import { AvatarBubble } from '@/renderer/shared/AvatarBubble';

interface MobileDmInboxProps {
  conversations: DirectMessageConversationSummary[];
  loading: boolean;
  error: string | null;
  currentUserId: string;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: (options?: { suppressLoadingState?: boolean }) => void;
  onCompose: () => void;
}

export function MobileDmInbox({
  conversations,
  loading,
  error,
  currentUserId: _currentUserId,
  onSelectConversation,
  onRefresh,
  onCompose,
}: MobileDmInboxProps) {
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
          className="flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          title="New message"
        >
          <PencilLine className="w-4 h-4 text-gray-300" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="min-h-full">
          {conversations.map((convo) => {
            const name = convo.otherUsername ?? 'Unknown User';
            const hasUnread = convo.unreadCount > 0;
            const timeLabel = formatConversationTime(convo.lastMessageAt ?? convo.updatedAt);

            return (
              <button
                key={convo.conversationId}
                onClick={() => onSelectConversation(convo.conversationId)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors border-b border-white/5"
              >
                {/* Avatar */}
                <AvatarBubble url={convo.otherAvatarUrl} name={name} size="md" />

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
  );
}
