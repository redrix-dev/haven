import React from 'react';
import { Loader2, RefreshCcw, Bell, Check, X, UserCheck, UserX, Settings } from 'lucide-react';
import type { NotificationItem, NotificationCounts } from '@/lib/backend/types';

interface MobileNotificationsViewProps {
  notificationItems: NotificationItem[];
  notificationCounts: NotificationCounts;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onMarkAllSeen: () => void;
  onMarkRead: (recipientId: string) => void;
  onDismiss: (recipientId: string) => void;
  onAcceptFriendRequest: (recipientId: string, friendRequestId: string) => void;
  onDeclineFriendRequest: (recipientId: string, friendRequestId: string) => void;
  onOpenItem: (notification: NotificationItem) => void;
  onRefresh: () => void;
  onSettingsPress: () => void;
}

function getNotificationTitle(kind: NotificationItem['kind']): string {
  switch (kind) {
    case 'friend_request_received': return 'Friend Request';
    case 'friend_request_accepted': return 'Friend Request Accepted';
    case 'dm_message': return 'Direct Message';
    case 'channel_mention': return 'Mentioned You';
    default: return 'Notification';
  }
}

function getNotificationSummary(item: NotificationItem): string {
  const actor = item.actorUsername ?? 'Someone';
  switch (item.kind) {
    case 'friend_request_received': return `${actor} sent you a friend request`;
    case 'friend_request_accepted': return `${actor} accepted your friend request`;
    case 'dm_message': return `${actor} sent you a message`;
    case 'channel_mention': return `${actor} mentioned you in a channel`;
    default: return (item.payload['message'] as string | undefined) ?? 'New notification';
  }
}

function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function MobileNotificationsView({
  notificationItems,
  notificationCounts,
  loading,
  refreshing,
  error,
  onMarkAllSeen,
  onMarkRead,
  onDismiss,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onOpenItem,
  onRefresh,
  onSettingsPress,
}: MobileNotificationsViewProps) {
  if (loading && notificationItems.length === 0) {
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
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  const activeItems = notificationItems.filter((n) => !n.dismissedAt);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-gray-400" />
          {notificationCounts.unreadCount > 0 && (
            <span className="text-xs text-gray-400">
              {notificationCounts.unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {refreshing && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          {notificationCounts.unseenCount > 0 && (
            <button
              onClick={onMarkAllSeen}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
            >
              Mark all seen
            </button>
          )}
          <button
            onClick={onSettingsPress}
            className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {activeItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Bell className="w-8 h-8 text-gray-700" />
            <p className="text-gray-500 text-sm">No notifications</p>
          </div>
        )}

        {activeItems.map((item) => {
          const isUnread = !item.readAt;
          const initial = item.actorUsername?.charAt(0).toUpperCase() ?? '?';
          const friendRequestId = item.payload['friendRequestId'] as string | undefined;

          return (
            <div
              key={`${item.recipientId}:${item.eventId}`}
              className={`px-4 py-4 border-b border-white/5 ${isUnread ? 'bg-blue-600/5' : ''}`}
            >
              <button
                onClick={() => onOpenItem(item)}
                className="w-full flex items-start gap-3 text-left"
              >
                {/* Actor avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                  {item.actorAvatarUrl ? (
                    <img src={item.actorAvatarUrl} alt={item.actorUsername ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-sm font-medium truncate ${isUnread ? 'text-white' : 'text-gray-300'}`}>
                      {getNotificationTitle(item.kind)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnread && (
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                      )}
                      <span className="text-[10px] text-gray-500">
                        {formatNotificationTime(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {getNotificationSummary(item)}
                  </p>
                </div>
              </button>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-3 ml-13 pl-[52px]">
                {/* Friend request actions */}
                {item.kind === 'friend_request_received' && friendRequestId && (
                  <>
                    <button
                      onClick={() => onAcceptFriendRequest(item.recipientId, friendRequestId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Accept
                    </button>
                    <button
                      onClick={() => onDeclineFriendRequest(item.recipientId, friendRequestId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Decline
                    </button>
                  </>
                )}

                {/* Mark read */}
                {isUnread && (
                  <button
                    onClick={() => onMarkRead(item.recipientId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark read
                  </button>
                )}

                {/* Dismiss */}
                <button
                  onClick={() => onDismiss(item.recipientId)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-white/5 text-gray-600 text-xs transition-colors ml-auto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
