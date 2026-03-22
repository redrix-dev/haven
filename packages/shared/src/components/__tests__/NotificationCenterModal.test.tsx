// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenterModal } from '@shared/components/NotificationCenterModal';
import { useNotificationsStore } from '@shared/stores/notificationsStore';
import type { NotificationItem, NotificationPreferences } from '@shared/lib/backend/types';
import type { NotificationAudioSettings } from '@platform/desktop/types';

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
  voicePresenceSoundEnabled: true,
  voicePresenceSoundVolume: 50,
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
  beforeEach(() => {
    useNotificationsStore.getState().reset();
  });

  it('opens a visible notification row via click and keyboard', async () => {
    const user = userEvent.setup();
    const onOpenNotificationItem = vi.fn();
    useNotificationsStore.getState().setNotifications([
      makeNotification({
        recipientId: 'recipient-mention-1',
        kind: 'channel_mention',
        sourceKind: 'message',
        payload: {
          title: 'Mention',
          message: 'You were mentioned in a channel',
          communityId: 'community-1',
          channelId: 'channel-1',
        },
      }),
    ]);
    useNotificationsStore.getState().setUnreadCount(1);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
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

  it('filters dm notifications out of the inbox list UI', () => {
    useNotificationsStore.getState().setNotifications([
      makeNotification({ recipientId: 'recipient-dm-1' }),
    ]);
    useNotificationsStore.getState().setUnreadCount(1);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        preferences={basePreferences}
        preferencesLoading={false}
        preferencesSaving={false}
        onUpdatePreferences={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />
    );

    expect(screen.queryByText(/direct message/i)).toBeNull();
    expect(screen.getByText(/no notifications yet/i)).toBeTruthy();
  });

  it('renders dismiss all and notification settings actions without inline settings content', async () => {
    const user = userEvent.setup();
    const onDismissAll = vi.fn();
    useNotificationsStore.getState().setNotifications([
      makeNotification({
        recipientId: 'recipient-mention-1',
        kind: 'channel_mention',
        sourceKind: 'message',
        payload: {
          title: 'Mention',
          message: 'You were mentioned in a channel',
          communityId: 'community-1',
          channelId: 'channel-1',
        },
      }),
    ]);
    useNotificationsStore.getState().setUnreadCount(1);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={onDismissAll}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        preferences={basePreferences}
        preferencesLoading={false}
        preferencesSaving={false}
        onUpdatePreferences={() => {}}
        localAudioSettings={baseLocalAudioSettings}
        localAudioSaving={false}
        onUpdateLocalAudioSettings={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /dismiss all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /notification settings/i })).toBeTruthy();
    expect(screen.queryByText(/global notification preferences/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /dismiss all/i }));
    expect(onDismissAll).toHaveBeenCalledTimes(1);
  });

  it('renders friend request notification actions including dismiss', async () => {
    const user = userEvent.setup();
    const onDismissFriendRequestNotification = vi.fn();
    useNotificationsStore.getState().setNotifications([
      makeNotification({
        recipientId: 'recipient-fr-1',
        kind: 'friend_request_received',
        sourceKind: 'friend_request',
        payload: {
          friendRequestId: 'fr-1',
          title: 'Friend request received',
          message: 'Someone sent a request',
        },
      }),
    ]);
    useNotificationsStore.getState().setUnreadCount(1);

    render(
      <NotificationCenterModal
        open
        onOpenChange={() => {}}
        counts={{ unseenCount: 1, unreadCount: 1 }}
        error={null}
        refreshing={false}
        onRefresh={() => {}}
        onMarkAllSeen={() => {}}
        onDismissAll={() => {}}
        onMarkNotificationRead={() => {}}
        onDismissNotification={() => {}}
        onAcceptFriendRequestNotification={() => {}}
        onDeclineFriendRequestNotification={() => {}}
        onDismissFriendRequestNotification={onDismissFriendRequestNotification}
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
    expect(screen.getByRole('button', { name: /^dismiss$/i })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^dismiss$/i }));
    expect(onDismissFriendRequestNotification).toHaveBeenCalledWith({
      recipientId: 'recipient-fr-1',
      friendRequestId: 'fr-1',
    });
  });
});
