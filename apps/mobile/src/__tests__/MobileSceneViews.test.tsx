// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileDmInbox } from '@mobile/mobile/MobileDmInbox';
import { MobileNotificationsView } from '@mobile/mobile/MobileNotificationsView';
import { MobileServerGrid } from '@mobile/mobile/MobileServerGrid';

describe('mobile scene views', () => {
  it('wraps the DM inbox in a single scene scroll owner', () => {
    const { container } = render(
      <MobileDmInbox
        conversations={[
          {
            conversationId: 'dm-1',
            kind: 'direct',
            otherUserId: 'user-2',
            otherUsername: 'Taylor',
            otherAvatarUrl: null,
            createdAt: new Date('2026-03-17T09:00:00.000Z').toISOString(),
            lastMessageId: 'msg-1',
            lastMessageAuthorUserId: 'user-2',
            lastMessagePreview: 'Hello',
            lastMessageAt: new Date('2026-03-17T10:00:00.000Z').toISOString(),
            lastMessageCreatedAt: new Date('2026-03-17T10:00:00.000Z').toISOString(),
            unreadCount: 2,
            isMuted: false,
            mutedUntil: null,
            updatedAt: new Date('2026-03-17T10:00:00.000Z').toISOString(),
          },
        ]}
        loading={false}
        error={null}
        currentUserId="user-1"
        onSelectConversation={() => {}}
        onRefresh={() => {}}
        onCompose={() => {}}
      />
    );

    expect(container.querySelectorAll('[data-mobile-scene-scroll="true"]').length).toBe(1);
    expect(screen.getByText('Direct Messages')).toBeTruthy();
    expect(screen.getByText('Taylor')).toBeTruthy();
  });

  it('wraps notifications in a single scene scroll owner', () => {
    const now = new Date('2026-03-17T10:00:00.000Z').toISOString();
    const { container } = render(
      <MobileNotificationsView
        notificationItems={[
          {
            recipientId: 'notif-1',
            eventId: 'event-1',
            kind: 'friend_request_received',
            sourceKind: 'friend_request',
            sourceId: 'friend-request-1',
            actorUserId: 'user-2',
            actorUsername: 'Taylor',
            actorAvatarUrl: null,
            deliverInApp: true,
            deliverSound: true,
            createdAt: now,
            seenAt: null,
            readAt: null,
            dismissedAt: null,
            payload: { friendRequestId: 'friend-request-1' },
          },
        ]}
        notificationCounts={{ unseenCount: 1, unreadCount: 1 }}
        loading={false}
        refreshing={false}
        error={null}
        onMarkAllSeen={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
        onAcceptFriendRequest={() => {}}
        onDeclineFriendRequest={() => {}}
        onOpenItem={() => {}}
        onRefresh={() => {}}
        onSettingsPress={() => {}}
      />
    );

    expect(container.querySelectorAll('[data-mobile-scene-scroll="true"]').length).toBe(1);
    expect(screen.getByText('Friend Request')).toBeTruthy();
    expect(screen.getByText(/Taylor sent you a friend request/i)).toBeTruthy();
  });

  it('wraps the server grid in a single scene scroll owner', () => {
    const { container } = render(
      <MobileServerGrid
        servers={[
          { id: 'server-1', name: 'Alpha' },
          { id: 'server-2', name: 'Beta' },
        ]}
        onSelectServer={() => {}}
        onCreateServer={() => {}}
        onJoinServer={() => {}}
        onReorder={() => {}}
      />
    );

    expect(container.querySelectorAll('[data-mobile-scene-scroll="true"]').length).toBe(1);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Join')).toBeTruthy();
  });
});
