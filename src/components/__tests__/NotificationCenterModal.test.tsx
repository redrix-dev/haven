// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationCenterModal } from '@/components/NotificationCenterModal';
import type { NotificationItem, NotificationPreferences } from '@/lib/backend/types';
import type { NotificationAudioSettings } from '@/shared/desktop/types';

const nowIso = new Date().toISOString();

const basePreferences: NotificationPreferences = {
  userId: 'user-1',
  friendRequestInAppEnabled: true,
  friendRequestSoundEnabled: true,
  friendRequestPushEnabled: true,
  dmInAppEnabled: true,
  dmSoundEnabled: true,
  dmPushEnabled: true,
  mentionInAppEnabled: true,
  mentionSoundEnabled: true,
  mentionPushEnabled: true,
  createdAt: nowIso,
  updatedAt: nowIso,
};

const baseLocalAudioSettings: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 50,
  playSoundsWhenFocused: true,
};

function makeNotification(partial: Partial<NotificationItem>): NotificationItem {
  return {
    recipientId: 'recipient-1',
    eventId: 'event-1',
    kind: 'dm_message',
    sourceKind: 'dm_message',
    sourceId: 'source-1',
    actorUserId: 'user-2',
    actorUsername: 'User Two',
    actorAvatarUrl: null,
    payload: {
      title: 'Direct message',
      message: 'A DM arrived',
      conversationId: 'conv-1',
    },
    deliverInApp: true,
    deliverSound: false,
    createdAt: nowIso,
    seenAt: null,
    readAt: null,
    dismissedAt: null,
    ...partial,
  };
}

describe('NotificationCenterModal', () => {
  it('opens a notification row via click and keyboard', async () => {
    const user = userEvent.setup();
    const onOpenNotificationItem = vi.fn();

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        notifications={[makeNotification({ recipientId: 'recipient-dm-1' })]}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        loading={false}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        onOpenNotificationItem={onOpenNotificationItem}
        preferences={basePreferences}
        preferencesLoading={false}
        preferencesSaving={false}
        onUpdatePreferences={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />
    );

    const row = screen.getByRole('button', { name: /open notification/i });
    await user.click(row);
    expect(onOpenNotificationItem).toHaveBeenCalledTimes(1);

    row.focus();
    await user.keyboard('{Enter}');
    expect(onOpenNotificationItem).toHaveBeenCalledTimes(2);
  });

  it('renders friend request notification actions when payload includes friendRequestId', () => {
    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        notifications={[
          makeNotification({
            kind: 'friend_request_received',
            sourceKind: 'friend_request',
            payload: {
              friendRequestId: 'fr-1',
              title: 'Friend request received',
              message: 'Someone sent a request',
            },
          }),
        ]}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        loading={false}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        onAcceptFriendRequestNotification={() => {}}
        onDeclineFriendRequestNotification={() => {}}
        preferences={basePreferences}
        preferencesLoading={false}
        preferencesSaving={false}
        onUpdatePreferences={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /accept/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /decline/i })).toBeTruthy();
  });
});
