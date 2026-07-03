import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { getNotificationBackend } from "@shared/lib/backend";
import { loadBootstrappedTestUsers } from "@test-support/fixtures/users";
import {
  resetFixtureDomainState,
  serviceSupabase,
  signInAsTestUser,
  signOutTestUser,
} from "@test-support/setup/supabaseLocal";

describe.sequential("NotificationBackend (contract)", () => {
  const users = loadBootstrappedTestUsers();

  beforeAll(async () => {
    await signInAsTestUser("member_a");
  });

  afterAll(async () => {
    await signOutTestUser();
  });

  beforeEach(async () => {
    await resetFixtureDomainState();
    await signInAsTestUser("member_a");
  });

  it("reads and updates global notification preferences", async () => {
    const original =
      await getNotificationBackend().getNotificationPreferences();
    expect(original.userId).toBe(users.member_a.id);

    const next = await getNotificationBackend().updateNotificationPreferences({
      ...original,
      mentionSoundEnabled: !original.mentionSoundEnabled,
      dmPushEnabled: !original.dmPushEnabled,
    });

    expect(next.userId).toBe(users.member_a.id);
    expect(next.mentionSoundEnabled).toBe(!original.mentionSoundEnabled);
    expect(next.dmPushEnabled).toBe(!original.dmPushEnabled);

    const reloaded =
      await getNotificationBackend().getNotificationPreferences();
    expect(reloaded.mentionSoundEnabled).toBe(next.mentionSoundEnabled);
    expect(reloaded.dmPushEnabled).toBe(next.dmPushEnabled);
  });

  it("lists inbox notifications and supports read/dismiss mutations", async () => {
    const notifications = await getNotificationBackend().listNotifications({
      limit: 20,
    });
    expect(Array.isArray(notifications)).toBe(true);

    if (notifications.length === 0) return;

    const target = notifications[0];
    const markedRead = await getNotificationBackend().markNotificationsRead([
      target.recipientId,
    ]);
    expect(markedRead).toBeGreaterThanOrEqual(0);

    const dismissed = await getNotificationBackend().dismissNotifications([
      target.recipientId,
    ]);
    expect(dismissed).toBeGreaterThanOrEqual(0);
  });

  it("lists sound-only notifications without changing inbox semantics", async () => {
    const sourceId = crypto.randomUUID();
    const { error: createError } = await serviceSupabase.rpc(
      "create_notification_event_with_recipients" as never,
      {
        p_kind: "system",
        p_source_kind: "system_event",
        p_source_id: sourceId,
        p_actor_user_id: null,
        p_payload: {
          title: "Sound-only contract test",
          message: "Should not appear in inbox list",
        },
        p_recipients: [
          {
            recipient_user_id: users.member_a.id,
            deliver_in_app: false,
            deliver_sound: true,
          },
        ],
      } as never,
    );
    expect(createError).toBeNull();

    const inboxNotifications = await getNotificationBackend().listNotifications(
      { limit: 50 },
    );
    expect(inboxNotifications.some((item) => item.sourceId === sourceId)).toBe(
      false,
    );

    const soundNotifications =
      await getNotificationBackend().listSoundNotifications({ limit: 50 });
    const target = soundNotifications.find(
      (item) => item.sourceId === sourceId,
    );

    expect(target).toBeTruthy();
    expect(target?.deliverInApp).toBe(false);
    expect(target?.deliverSound).toBe(true);
  });

  it("manages expo push subscriptions with owner isolation", async () => {
    const tokenA = `ExponentPushToken[contract-${crypto.randomUUID()}]`;
    const installationId = `vitest-expo-install-${crypto.randomUUID()}`;

    const created = await getNotificationBackend().upsertExpoPushSubscription({
      expoPushToken: tokenA,
      platform: "android",
      installationId,
      metadata: { suite: "notificationBackend.contract", device: "expo-a1" },
    });

    expect(created.userId).toBe(users.member_a.id);
    expect(created.expoPushToken).toBe(tokenA);
    expect(created.installationId).toBe(installationId);
    expect(created.platform).toBe("android");

    const listedA = await getNotificationBackend().listExpoPushSubscriptions();
    expect(listedA.some((row) => row.expoPushToken === tokenA)).toBe(true);

    const tokenB = `ExponentPushToken[contract-${crypto.randomUUID()}]`;
    const rotated = await getNotificationBackend().upsertExpoPushSubscription({
      expoPushToken: tokenB,
      platform: "android",
      installationId,
      metadata: {
        suite: "notificationBackend.contract",
        device: "expo-a1",
        rev: 2,
      },
    });

    expect(rotated.expoPushToken).toBe(tokenB);
    const listedAfterRotate =
      await getNotificationBackend().listExpoPushSubscriptions();
    expect(
      listedAfterRotate.filter((row) => row.installationId === installationId),
    ).toHaveLength(1);

    await signInAsTestUser("member_b");
    const listedB = await getNotificationBackend().listExpoPushSubscriptions();
    expect(listedB.some((row) => row.expoPushToken === tokenB)).toBe(false);

    const deletedByB =
      await getNotificationBackend().deleteExpoPushSubscription(tokenB);
    expect(deletedByB).toBe(false);

    await signInAsTestUser("member_a");
    const deletedByA =
      await getNotificationBackend().deleteExpoPushSubscription(tokenB);
    expect(deletedByA).toBe(true);
    const deletedAgain =
      await getNotificationBackend().deleteExpoPushSubscription(tokenB);
    expect(deletedAgain).toBe(false);
  });

  it("lists delivery traces for the current user", async () => {
    const recipientId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    const { error: insertError } = await serviceSupabase
      .from("notification_delivery_traces" as never)
      .insert({
        notification_recipient_id: null,
        notification_event_id: null,
        recipient_user_id: users.member_a.id,
        transport: "route_policy",
        stage: "client_route",
        decision: "skip",
        reason_code: "sw_focused_window_suppressed",
        details: {
          suite: "notificationBackend.contract",
          syntheticRecipientId: recipientId,
          syntheticEventId: eventId,
        },
      } as never);

    expect(insertError).toBeNull();

    const traces =
      await getNotificationBackend().listNotificationDeliveryTraces({
        limit: 20,
      });
    const target = traces.find(
      (trace) =>
        trace.details.syntheticRecipientId === recipientId &&
        trace.details.syntheticEventId === eventId,
    );

    expect(target).toBeTruthy();
    expect(target?.transport).toBe("route_policy");
    expect(target?.stage).toBe("client_route");
    expect(target?.reasonCode).toBe("sw_focused_window_suppressed");
  });

});
