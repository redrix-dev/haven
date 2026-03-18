import React from 'react';
import { BellOff, Loader2, PencilLine, RefreshCcw } from 'lucide-react';
import type { DirectMessageConversationSummary } from '@shared/lib/backend/types';
import { DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT } from '@shared/lib/backend/directMessageUtils';
import { MobileSceneScaffold } from '@mobile/mobile/layout/MobileSceneScaffold';

interface MobileDmInboxProps {
  conversations: DirectMessageConversationSummary[];
  loading: boolean;
  error: string | null;
  currentUserId: string;
  onSelectConversation: (conversationId: string) => void;
  onRefresh: (options?: { suppressLoadingState?: boolean }) => void;
  onCompose: () => void;
}

function formatConversationTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  const inboxHeader = (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <span className="text-sm font-semibold text-gray-300">Direct Messages</span>
      <button
        onClick={onCompose}
        className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 transition-colors hover:bg-white/10 active:bg-white/15"
        title="New message"
      >
        <PencilLine className="h-4 w-4 text-gray-300" />
      </button>
    </div>
  );

  if (loading && conversations.length === 0) {
    return (
      <MobileSceneScaffold
        header={inboxHeader}
        body={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        }
      />
    );
  }

  if (error) {
    return (
      <MobileSceneScaffold
        header={inboxHeader}
        body={
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <p className="text-center text-sm text-gray-500">{error}</p>
            <button
              onClick={() => onRefresh()}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
            >
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
          </div>
        }
      />
    );
  }

  return (
    <MobileSceneScaffold
      header={inboxHeader}
      body={
        conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
            <p className="text-center text-sm text-gray-500">No direct messages yet.</p>
          </div>
        ) : (
          <div className="min-h-full">
            {conversations.map((conversation) => {
              const name = conversation.otherUsername ?? 'Unknown User';
              const initial = name.charAt(0).toUpperCase();
              const hasUnread = conversation.unreadCount > 0;
              const timeLabel = formatConversationTime(
                conversation.lastMessageAt ?? conversation.updatedAt
              );

              return (
                <button
                  key={conversation.conversationId}
                  onClick={() => onSelectConversation(conversation.conversationId)}
                  className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 transition-colors hover:bg-white/5 active:bg-white/10"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-base font-bold text-white">
                    {conversation.otherAvatarUrl ? (
                      <img
                        src={conversation.otherAvatarUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initial
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${hasUnread ? 'font-semibold text-white' : 'text-gray-300'}`}
                      >
                        {name}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {conversation.isMuted && <BellOff className="h-3 w-3 text-gray-600" />}
                        {timeLabel && (
                          <span className="text-[10px] text-gray-500">{timeLabel}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-xs ${hasUnread ? 'text-gray-300' : 'text-gray-500'}`}
                      >
                        {conversation.lastMessagePreview ??
                          (conversation.lastMessageId
                            ? DIRECT_MESSAGE_IMAGE_PREVIEW_TEXT
                            : 'No messages yet')}
                      </p>
                      {hasUnread && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold leading-none text-white">
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      }
    />
  );
}
