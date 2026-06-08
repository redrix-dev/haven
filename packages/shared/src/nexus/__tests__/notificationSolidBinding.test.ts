import { describe, expect, it } from 'vitest';
import { createRoot } from 'solid-js';
import { createMemoryPersistence } from '@shared/core';
import { NotificationNexus } from '@shared/nexus/notifications/NotificationNexus';
import {
  createNotificationCounts,
  createNotifications,
} from '@solid-bindings';
import type { NotificationItem } from '@shared/lib/backend/types';

const item = (recipientId: string): NotificationItem =>
  ({
    recipientId,
    eventId: 'e1',
    kind: 'mention',
    sourceKind: 'community_message',
    sourceId: 's1',
    actorUserId: null,
    actorUsername: null,
    actorAvatarUrl: null,
  }) as unknown as NotificationItem;

describe('NotificationNexus → @solid-bindings', () => {
  it('createNotifications + createNotificationCounts react to mutations', () => {
    createRoot((dispose) => {
      const nexus = new NotificationNexus(createMemoryPersistence(), {} as never);
      const items = createNotifications(nexus);
      const counts = createNotificationCounts(nexus);

      expect(items()).toEqual([]);
      expect(counts().unseenCount).toBe(0);

      nexus.setNotifications([item('n1'), item('n2')], { hasMore: false });
      expect(items().map((i) => i.recipientId)).toEqual(['n1', 'n2']);

      nexus.setCounts({ unseenCount: 3, unreadCount: 2 });
      expect(counts().unseenCount).toBe(3);

      dispose();
    });
  });
});
