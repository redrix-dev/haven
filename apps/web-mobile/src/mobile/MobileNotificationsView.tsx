import React from 'react';
import {
  Bell,
  Check,
  Loader2,
  RefreshCcw,
  Settings,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { NotificationCounts, NotificationItem } from '@shared/lib/backend/types';
import { MobileSceneScaffold } from '@web-mobile/mobile/layout/MobileSceneScaffold';

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
    case 'friend_request_received':
      return 'Friend Request';
    case 'friend_request_accepted':
      return 'Friend Request Accepted';
    case 'dm_message':
      return 'Direct Message';
    case 'channel_mention':
      return 'Mentioned You';
    default:
      return 'Notification';
  }
}

function getNotificationSummary(item: NotificationItem): string {
  const actor = item.actorUsername ?? 'Someone';
  switch (item.kind) {
    case 'friend_request_received':
      return `${actor} sent you a friend request`;
    case 'friend_request_accepted':
      return `${actor} accepted your friend request`;
    case 'dm_message':
      return `${actor} sent you a message`;
    case 'channel_mention':
      return `${actor} mentioned you in a channel`;
    default:
      return (item.payload['message'] as string | undefined) ?? 'New notification';
  }
}

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  const notificationsHeader = (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-gray-400" />
        {notificationCounts.unreadCount > 0 && (
          <span className="text-xs text-gray-400">
            {notificationCounts.unreadCount} unread
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}
        {notificationCounts.unseenCount > 0 && (
          <button
            onClick={onMarkAllSeen}
            className="rounded-lg px-2 py-1 text-xs text-blue-400 transition-colors hover:bg-white/5 hover:text-blue-300"
          >
            Mark all seen
          </button>
        )}
        <button
          onClick={onSettingsPress}
          className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <Settings className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </div>
  );

  if (loading && notificationItems.length === 0) {
    return (
      <MobileSceneScaffold
        header={notificationsHeader}
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
        header={notificationsHeader}
        body={
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
            <p className="text-center text-sm text-gray-500">{error}</p>
            <button
              onClick={onRefresh}
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

  const activeItems = notificationItems.filter((notification) => !notification.dismissedAt);

  return (
    <MobileSceneScaffold
      header={notificationsHeader}
      body={
        activeItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <Bell className="h-8 w-8 text-gray-700" />
            <p className="text-sm text-gray-500">No notifications</p>
          </div>
        ) : (
          <div className="min-h-full">
            {activeItems.map((item) => {
              const isUnread = !item.readAt;
              const initial = item.actorUsername?.charAt(0).toUpperCase() ?? '?';
              const friendRequestId = item.payload['friendRequestId'] as string | undefined;

              return (
                <div
                  key={`${item.recipientId}:${item.eventId}`}
                  className={`border-b border-white/5 px-4 py-4 ${isUnread ? 'bg-blue-600/5' : ''}`}
                >
                  <button
                    onClick={() => onOpenItem(item)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-sm font-bold text-white">
                      {item.actorAvatarUrl ? (
                        <img
                          src={item.actorAvatarUrl}
                          alt={item.actorUsername ?? ''}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm font-medium ${isUnread ? 'text-white' : 'text-gray-300'}`}
                        >
                          {getNotificationTitle(item.kind)}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isUnread && <div className="h-2 w-2 rounded-full bg-blue-400" />}
                          <span className="text-[10px] text-gray-500">
                            {formatNotificationTime(item.createdAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-gray-400">
                        {getNotificationSummary(item)}
                      </p>
                    </div>
                  </button>

                  <div className="ml-13 mt-3 flex items-center gap-2 pl-[52px]">
                    {item.kind === 'friend_request_received' && friendRequestId && (
                      <>
                        <button
                          onClick={() =>
                            onAcceptFriendRequest(item.recipientId, friendRequestId)
                          }
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Accept
                        </button>
                        <button
                          onClick={() =>
                            onDeclineFriendRequest(item.recipientId, friendRequestId)
                          }
                          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Decline
                        </button>
                      </>
                    )}

                    {isUnread && (
                      <button
                        onClick={() => onMarkRead(item.recipientId)}
                        className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/10"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark read
                      </button>
                    )}

                    <button
                      onClick={() => onDismiss(item.recipientId)}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-600 transition-colors hover:bg-white/5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    />
  );
}
