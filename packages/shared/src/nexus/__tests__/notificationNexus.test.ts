import { describe, expect, it, vi } from 'vitest';
import { createMemoryPersistence } from '@shared/core';
import { NotificationNexus } from '@shared/nexus/notifications/NotificationNexus';
import type { NotificationItem } from '@shared/lib/backend/types';

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem =>
  ({
    recipientId: 'r1',
    eventId: 'e1',
    kind: 'mention',
    sourceKind: 'community_message',
    sourceId: 's1',
    actorUserId: null,
    actorUsername: null,
    actorAvatarUrl: null,
    ...overrides,
  }) as NotificationItem;

describe('NotificationNexus', () => {
  it('loads the inbox and updates counts', async () => {
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      listNotifications: vi.fn(async () => [item()]),
      getNotificationCounts: vi.fn(async () => ({
        unseenCount: 1,
        unreadCount: 1,
      })),
    } as never);

    await nexus.loadInbox();

    expect(nexus.getSnapshot('r1')).toBeDefined();
    expect(nexus.getReactiveStore().getState().counts.unseenCount).toBe(1);
  });

  it('dedupes concurrent inbox loads', async () => {
    const list = vi.fn(async () => [item()]);
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      listNotifications: list,
      getNotificationCounts: vi.fn(async () => ({
        unseenCount: 0,
        unreadCount: 0,
      })),
    } as never);

    await Promise.all([nexus.loadInbox(), nexus.loadInbox()]);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('skips fresh ensured inbox loads', async () => {
    const list = vi.fn(async () => [item()]);
    const getNotificationCounts = vi.fn(async () => ({
      unseenCount: 1,
      unreadCount: 1,
    }));
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      listNotifications: list,
      getNotificationCounts,
    } as never);

    await nexus.ensureInbox();
    await nexus.ensureInbox();

    expect(list).toHaveBeenCalledTimes(1);
    expect(getNotificationCounts).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent preference loads', async () => {
    const getNotificationPreferences = vi.fn(async () => ({
      friendRequestInAppEnabled: true,
      friendRequestSoundEnabled: true,
      friendRequestPushEnabled: true,
      dmInAppEnabled: true,
      dmSoundEnabled: true,
      dmPushEnabled: true,
      mentionInAppEnabled: true,
      mentionSoundEnabled: true,
      mentionPushEnabled: true,
    }));
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      getNotificationPreferences,
    } as never);

    await Promise.all([nexus.ensurePreferences(), nexus.ensurePreferences()]);
    await nexus.ensurePreferences();

    expect(getNotificationPreferences).toHaveBeenCalledTimes(1);
  });

  it('markSeen delegates and refreshes counts', async () => {
    const markSeen = vi.fn(async () => 1);
    const getCounts = vi.fn(async () => ({
      unseenCount: 0,
      unreadCount: 0,
    }));
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      markNotificationsSeen: markSeen,
      getNotificationCounts: getCounts,
    } as never);

    await nexus.markSeen(['r1']);

    expect(markSeen).toHaveBeenCalledWith(['r1']);
  });

  it('delegates Expo push subscription registration through the notification backend', async () => {
    const upsertExpoPushSubscription = vi.fn(async () => ({
      id: 'sub1',
      userId: 'u1',
      expoPushToken: 'ExponentPushToken[test]',
      platform: 'ios',
      installationId: 'install1',
      metadata: { source: 'test' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
    }));
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      upsertExpoPushSubscription,
    } as never);

    const result = await nexus.upsertExpoPushSubscription({
      expoPushToken: 'ExponentPushToken[test]',
      platform: 'ios',
      installationId: 'install1',
      metadata: { source: 'test' },
    });

    expect(upsertExpoPushSubscription).toHaveBeenCalledWith({
      expoPushToken: 'ExponentPushToken[test]',
      platform: 'ios',
      installationId: 'install1',
      metadata: { source: 'test' },
    });
    expect(result.id).toBe('sub1');
  });

  it('delegates Expo push subscription deletion through the notification backend', async () => {
    const deleteExpoPushSubscription = vi.fn(async () => true);
    const nexus = new NotificationNexus(createMemoryPersistence(), {
      deleteExpoPushSubscription,
    } as never);

    await expect(
      nexus.deleteExpoPushSubscription('ExponentPushToken[test]'),
    ).resolves.toBe(true);

    expect(deleteExpoPushSubscription).toHaveBeenCalledWith(
      'ExponentPushToken[test]',
    );
  });
});
