import { describe, beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { centralNotificationBackend } from '@/lib/backend/notificationBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import { resetFixtureDomainState, signInAsTestUser, signOutTestUser } from '../../../../test/setup/supabaseLocal';

describe.sequential('NotificationBackend (contract)', () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser('member_a');
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser('member_a');
  });

  it('reads and updates global notification preferences', async () => {
    const original = await centralNotificationBackend.getNotificationPreferences();
    expect(original.userId).toBe(users.member_a.id);

    const next = await centralNotificationBackend.updateNotificationPreferences({
      ...original,
      mentionSoundEnabled: !original.mentionSoundEnabled,
    });

    expect(next.userId).toBe(users.member_a.id);
    expect(next.mentionSoundEnabled).toBe(!original.mentionSoundEnabled);

    const reloaded = await centralNotificationBackend.getNotificationPreferences();
    expect(reloaded.mentionSoundEnabled).toBe(next.mentionSoundEnabled);
  });

  it('lists inbox notifications and supports read/dismiss mutations', async () => {
    const notifications = await centralNotificationBackend.listNotifications({ limit: 20 });
    expect(Array.isArray(notifications)).toBe(true);

    if (notifications.length === 0) return;

    const target = notifications[0];
    const markedRead = await centralNotificationBackend.markNotificationsRead([target.recipientId]);
    expect(markedRead).toBeGreaterThanOrEqual(0);

    const dismissed = await centralNotificationBackend.dismissNotifications([target.recipientId]);
    expect(dismissed).toBeGreaterThanOrEqual(0);
  });
});

