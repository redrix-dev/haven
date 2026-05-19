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
    const nexus = new NotificationNexus(createMemoryPersistence());
    nexus.setBackend({
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
    const nexus = new NotificationNexus(createMemoryPersistence());
    const list = vi.fn(async () => [item()]);
    nexus.setBackend({
      listNotifications: list,
      getNotificationCounts: vi.fn(async () => ({
        unseenCount: 0,
        unreadCount: 0,
      })),
    } as never);

    await Promise.all([nexus.loadInbox(), nexus.loadInbox()]);

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('markSeen delegates and refreshes counts', async () => {
    const nexus = new NotificationNexus(createMemoryPersistence());
    const markSeen = vi.fn(async () => 1);
    const getCounts = vi.fn(async () => ({
      unseenCount: 0,
      unreadCount: 0,
    }));
    nexus.setBackend({
      markNotificationsSeen: markSeen,
      getNotificationCounts: getCounts,
    } as never);

    await nexus.markSeen(['r1']);

    expect(markSeen).toHaveBeenCalledWith(['r1']);
  });
});
