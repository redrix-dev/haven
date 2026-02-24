import React from 'react';
import type { NotificationBackend } from '@/lib/backend/notificationBackend';
import type { SocialBackend } from '@/lib/backend/socialBackend';
import type { NotificationItem } from '@/lib/backend/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { getNotificationPayloadString } from '@/renderer/app/utils';

type UseNotificationInteractionsInput = {
  notificationBackend: Pick<NotificationBackend, 'markNotificationsRead'>;
  socialBackend: Pick<SocialBackend, 'acceptFriendRequest' | 'declineFriendRequest'>;
  friendsSocialPanelEnabled: boolean;
  refreshNotificationInbox: (options?: { playSoundsForNew?: boolean }) => Promise<void>;
  refreshSocialCounts: () => Promise<void>;
  setNotificationsError: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenDmConversation: (conversationId: string) => Promise<void>;
  onOpenFriendsPanel: (input: { tab: 'requests' | 'friends'; highlightedRequestId: string | null }) => void;
  onOpenChannelMention: (input: { communityId: string; channelId: string }) => void;
};

export function useNotificationInteractions({
  notificationBackend,
  socialBackend,
  friendsSocialPanelEnabled,
  refreshNotificationInbox,
  refreshSocialCounts,
  setNotificationsError,
  onOpenDmConversation,
  onOpenFriendsPanel,
  onOpenChannelMention,
}: UseNotificationInteractionsInput) {
  const openNotificationItem = React.useCallback(
    async (notification: NotificationItem) => {
      try {
        switch (notification.kind) {
          case 'dm_message': {
            const conversationId = getNotificationPayloadString(notification, 'conversationId');
            if (!conversationId) {
              throw new Error('This notification does not include a DM conversation target.');
            }
            await onOpenDmConversation(conversationId);
            break;
          }
          case 'friend_request_received': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            onOpenFriendsPanel({
              tab: 'requests',
              highlightedRequestId: getNotificationPayloadString(notification, 'friendRequestId'),
            });
            break;
          }
          case 'friend_request_accepted': {
            if (!friendsSocialPanelEnabled) {
              throw new Error('Friends are not enabled for your account.');
            }
            onOpenFriendsPanel({
              tab: 'friends',
              highlightedRequestId: null,
            });
            break;
          }
          case 'channel_mention': {
            const communityId = getNotificationPayloadString(notification, 'communityId');
            const channelId = getNotificationPayloadString(notification, 'channelId');
            if (!communityId || !channelId) {
              throw new Error('This mention notification does not include a channel target.');
            }
            onOpenChannelMention({ communityId, channelId });
            break;
          }
          default: {
            // Future notification kinds can add deep-link routes here.
            break;
          }
        }

        await notificationBackend.markNotificationsRead([notification.recipientId]);
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to open notification.'));
      }
    },
    [
      friendsSocialPanelEnabled,
      notificationBackend,
      onOpenChannelMention,
      onOpenDmConversation,
      onOpenFriendsPanel,
      refreshNotificationInbox,
      setNotificationsError,
    ]
  );

  const acceptFriendRequestFromNotification = React.useCallback(
    async (input: { recipientId: string; friendRequestId: string }) => {
      try {
        await socialBackend.acceptFriendRequest(input.friendRequestId);
        await notificationBackend.markNotificationsRead([input.recipientId]);
        await Promise.all([
          refreshNotificationInbox({ playSoundsForNew: false }),
          refreshSocialCounts(),
        ]);
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to accept friend request.'));
      }
    },
    [
      notificationBackend,
      refreshNotificationInbox,
      refreshSocialCounts,
      setNotificationsError,
      socialBackend,
    ]
  );

  const declineFriendRequestFromNotification = React.useCallback(
    async (input: { recipientId: string; friendRequestId: string }) => {
      try {
        await socialBackend.declineFriendRequest(input.friendRequestId);
        await notificationBackend.markNotificationsRead([input.recipientId]);
        await Promise.all([
          refreshNotificationInbox({ playSoundsForNew: false }),
          refreshSocialCounts(),
        ]);
      } catch (error) {
        setNotificationsError(getErrorMessage(error, 'Failed to decline friend request.'));
      }
    },
    [
      notificationBackend,
      refreshNotificationInbox,
      refreshSocialCounts,
      setNotificationsError,
      socialBackend,
    ]
  );

  return {
    state: {},
    derived: {},
    actions: {
      openNotificationItem,
      acceptFriendRequestFromNotification,
      declineFriendRequestFromNotification,
    },
  };
}
