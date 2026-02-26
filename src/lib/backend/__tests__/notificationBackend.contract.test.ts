import { describe, beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { centralNotificationBackend } from '@/lib/backend/notificationBackend';
import { loadBootstrappedTestUsers } from '../../../../test/fixtures/users';
import {
  resetFixtureDomainState,
  serviceSupabase,
  signInAsTestUser,
  signOutTestUser,
} from '../../../../test/setup/supabaseLocal';

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
      dmPushEnabled: !original.dmPushEnabled,
    });

    expect(next.userId).toBe(users.member_a.id);
    expect(next.mentionSoundEnabled).toBe(!original.mentionSoundEnabled);
    expect(next.dmPushEnabled).toBe(!original.dmPushEnabled);

    const reloaded = await centralNotificationBackend.getNotificationPreferences();
    expect(reloaded.mentionSoundEnabled).toBe(next.mentionSoundEnabled);
    expect(reloaded.dmPushEnabled).toBe(next.dmPushEnabled);
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

  it('lists sound-only notifications without changing inbox semantics', async () => {
    const sourceId = crypto.randomUUID();
    const { error: createError } = await serviceSupabase.rpc(
      'create_notification_event_with_recipients' as never,
      {
        p_kind: 'system',
        p_source_kind: 'system_event',
        p_source_id: sourceId,
        p_actor_user_id: null,
        p_payload: {
          title: 'Sound-only contract test',
          message: 'Should not appear in inbox list',
        },
        p_recipients: [
          {
            recipient_user_id: users.member_a.id,
            deliver_in_app: false,
            deliver_sound: true,
          },
        ],
      } as never
    );
    expect(createError).toBeNull();

    const inboxNotifications = await centralNotificationBackend.listNotifications({ limit: 50 });
    expect(inboxNotifications.some((item) => item.sourceId === sourceId)).toBe(false);

    const soundNotifications = await centralNotificationBackend.listSoundNotifications({ limit: 50 });
    const target = soundNotifications.find((item) => item.sourceId === sourceId);

    expect(target).toBeTruthy();
    expect(target?.deliverInApp).toBe(false);
    expect(target?.deliverSound).toBe(true);
  });

  it('manages web push subscriptions with owner isolation', async () => {
    const endpoint = `https://push.example.test/member-a/${crypto.randomUUID()}`;
    const installationId = `vitest-installation-${crypto.randomUUID()}`;

    const created = await centralNotificationBackend.upsertWebPushSubscription({
      endpoint,
      installationId,
      p256dhKey: 'p256dh-member-a',
      authKey: 'auth-member-a',
      userAgent: 'vitest/member-a',
      clientPlatform: 'android',
      appDisplayMode: 'standalone',
      metadata: { suite: 'notificationBackend.contract', device: 'a1' },
    });

    expect(created.userId).toBe(users.member_a.id);
    expect(created.endpoint).toBe(endpoint);
    expect(created.installationId).toBe(installationId);
    expect(created.clientPlatform).toBe('android');
    expect(created.metadata).toMatchObject({ device: 'a1' });

    const listedForMemberA = await centralNotificationBackend.listWebPushSubscriptions();
    expect(listedForMemberA.some((row) => row.endpoint === endpoint)).toBe(true);

    const updated = await centralNotificationBackend.upsertWebPushSubscription({
      endpoint,
      installationId,
      p256dhKey: 'p256dh-member-a-updated',
      authKey: 'auth-member-a-updated',
      userAgent: 'vitest/member-a-v2',
      clientPlatform: 'android',
      appDisplayMode: 'browser',
      metadata: { suite: 'notificationBackend.contract', device: 'a1', rev: 2 },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.p256dhKey).toBe('p256dh-member-a-updated');
    expect(updated.appDisplayMode).toBe('browser');
    expect(updated.metadata).toMatchObject({ rev: 2 });

    const rotatedEndpoint = `https://push.example.test/member-a/${crypto.randomUUID()}`;
    const rotated = await centralNotificationBackend.upsertWebPushSubscription({
      endpoint: rotatedEndpoint,
      installationId,
      p256dhKey: 'p256dh-member-a-rotated',
      authKey: 'auth-member-a-rotated',
      userAgent: 'vitest/member-a-v3',
      clientPlatform: 'android',
      appDisplayMode: 'standalone',
      metadata: { suite: 'notificationBackend.contract', device: 'a1', rev: 3 },
    });

    expect(rotated.endpoint).toBe(rotatedEndpoint);
    expect(rotated.installationId).toBe(installationId);

    const listedAfterRotate = await centralNotificationBackend.listWebPushSubscriptions();
    expect(listedAfterRotate.filter((row) => row.installationId === installationId)).toHaveLength(1);

    await signInAsTestUser('member_b');

    const listedForMemberB = await centralNotificationBackend.listWebPushSubscriptions();
    expect(listedForMemberB.some((row) => row.endpoint === endpoint)).toBe(false);

    const deletedByMemberB = await centralNotificationBackend.deleteWebPushSubscription(endpoint);
    expect(deletedByMemberB).toBe(false);

    await signInAsTestUser('member_a');

    const stillPresentForMemberA = await centralNotificationBackend.listWebPushSubscriptions();
    expect(stillPresentForMemberA.some((row) => row.endpoint === endpoint)).toBe(false);
    expect(stillPresentForMemberA.some((row) => row.endpoint === rotatedEndpoint)).toBe(true);

    const deletedByMemberA = await centralNotificationBackend.deleteWebPushSubscription(rotatedEndpoint);
    expect(deletedByMemberA).toBe(true);

    const deletedAgain = await centralNotificationBackend.deleteWebPushSubscription(rotatedEndpoint);
    expect(deletedAgain).toBe(false);
  });

  it('lists delivery traces for the current user', async () => {
    const recipientId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    const { error: insertError } = await serviceSupabase
      .from('notification_delivery_traces' as never)
      .insert({
        notification_recipient_id: null,
        notification_event_id: null,
        recipient_user_id: users.member_a.id,
        transport: 'route_policy',
        stage: 'client_route',
        decision: 'skip',
        reason_code: 'sw_focused_window_suppressed',
        details: {
          suite: 'notificationBackend.contract',
          syntheticRecipientId: recipientId,
          syntheticEventId: eventId,
        },
      } as never);

    expect(insertError).toBeNull();

    const traces = await centralNotificationBackend.listNotificationDeliveryTraces({ limit: 20 });
    const target = traces.find(
      (trace) =>
        trace.details.syntheticRecipientId === recipientId &&
        trace.details.syntheticEventId === eventId
    );

    expect(target).toBeTruthy();
    expect(target?.transport).toBe('route_policy');
    expect(target?.stage).toBe('client_route');
    expect(target?.reasonCode).toBe('sw_focused_window_suppressed');
  });

  it('reads web push dispatch wakeup diagnostics state', async () => {
    const { error: upsertError } = await serviceSupabase
      .from('notification_dispatch_wakeups' as never)
      .upsert(
        {
          id: true,
          enabled: true,
          shadow_mode: true,
          min_interval_seconds: 3,
          last_mode: 'shadow',
          last_reason: 'vitest-contract',
          last_skip_reason: 'debounced',
          total_attempts: 11,
          total_scheduled: 5,
          total_debounced: 6,
        } as never,
        { onConflict: 'id' }
      );

    expect(upsertError).toBeNull();

    const diagnostics = await centralNotificationBackend.getWebPushDispatchWakeupDiagnostics();
    expect(diagnostics).toBeTruthy();
    expect(diagnostics?.enabled).toBe(true);
    expect(diagnostics?.shadowMode).toBe(true);
    expect(diagnostics?.minIntervalSeconds).toBe(3);
    expect(diagnostics?.lastMode).toBe('shadow');
    expect(diagnostics?.lastReason).toBe('vitest-contract');
    expect(diagnostics?.lastSkipReason).toBe('debounced');
    expect(diagnostics?.totalAttempts).toBeGreaterThanOrEqual(11);
  });

  it('reads web push dispatch queue health diagnostics for active platform staff and rejects non-staff', async () => {
    const endpoint = `https://push.example.test/member-a/${crypto.randomUUID()}`;
    await centralNotificationBackend.upsertWebPushSubscription({
      endpoint,
      installationId: `vitest-queue-health-${crypto.randomUUID()}`,
      p256dhKey: 'p256dh-queue-health',
      authKey: 'auth-queue-health',
      userAgent: 'vitest/queue-health',
      clientPlatform: 'windows',
      appDisplayMode: 'standalone',
      metadata: { suite: 'notificationBackend.contract', queueHealth: true },
    });

    const sourceId = crypto.randomUUID();
    const { error: createError } = await serviceSupabase.rpc(
      'create_notification_event_with_recipients' as never,
      {
        p_kind: 'system',
        p_source_kind: 'system_event',
        p_source_id: sourceId,
        p_actor_user_id: null,
        p_payload: {
          title: 'Queue health contract test',
          message: 'Generate one queued web push job',
        },
        p_recipients: [
          {
            recipient_user_id: users.member_a.id,
            deliver_in_app: true,
            deliver_sound: false,
          },
        ],
      } as never
    );
    expect(createError).toBeNull();

    await expect(centralNotificationBackend.getWebPushDispatchQueueHealthDiagnostics()).rejects.toBeTruthy();

    await signInAsTestUser('platform_staff_active');

    const diagnostics = await centralNotificationBackend.getWebPushDispatchQueueHealthDiagnostics();
    expect(diagnostics).toBeTruthy();
    expect(diagnostics?.totalPending).toBeGreaterThanOrEqual(1);
    expect(diagnostics?.claimableNowCount).toBeGreaterThanOrEqual(1);
    expect(typeof diagnostics?.asOf).toBe('string');

    await signInAsTestUser('member_a');
  });

  it('allows active platform staff to update wakeup config and rejects non-staff', async () => {
    await expect(
      centralNotificationBackend.updateWebPushDispatchWakeupConfig({
        enabled: false,
        shadowMode: false,
        minIntervalSeconds: 1,
      })
    ).rejects.toBeTruthy();

    await signInAsTestUser('platform_staff_active');

    const updated = await centralNotificationBackend.updateWebPushDispatchWakeupConfig({
      enabled: true,
      shadowMode: true,
      minIntervalSeconds: 2,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.shadowMode).toBe(true);
    expect(updated.minIntervalSeconds).toBe(2);

    await signInAsTestUser('member_a');
  });
});

