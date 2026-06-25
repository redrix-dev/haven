import type { HavenReactCore } from "./HavenReactCore";
import { playNotificationSound } from "@shared/features/notifications/utils/sound";
import { recordLocalNotificationDeliveryTrace } from "@shared/features/notifications/utils/devTrace";
import type { NotificationAudioSettings } from "@shared/types/settings";

export type NotificationSoundSyncState = {
  bootstrapped: boolean;
  knownRecipientIds: Set<string>;
};

export function createNotificationSoundSyncState(): NotificationSoundSyncState {
  return {
    bootstrapped: false,
    knownRecipientIds: new Set(),
  };
}

export async function bootstrapNotificationSoundSync(
  core: HavenReactCore,
  state: NotificationSoundSyncState,
): Promise<void> {
  try {
    const items = await core.backends.notifications.listSoundNotifications({
      limit: 50,
    });
    state.knownRecipientIds = new Set(items.map((item) => item.recipientId));
    state.bootstrapped = true;
  } catch {
    state.bootstrapped = false;
    state.knownRecipientIds = new Set();
  }
}

export async function syncNotificationSounds(
  core: HavenReactCore,
  audioSettings: NotificationAudioSettings,
  state: NotificationSoundSyncState,
): Promise<void> {
  if (!state.bootstrapped) return;

  const soundItems = await core.backends.notifications.listSoundNotifications({
    limit: 50,
  });
  const previous = state.knownRecipientIds;
  const next = new Set(soundItems.map((item) => item.recipientId));
  state.knownRecipientIds = next;

  for (const item of soundItems) {
    if (previous.has(item.recipientId) || item.dismissedAt) continue;
    const result = await playNotificationSound({
      kind: item.kind,
      deliverSound: item.deliverSound,
      audioSettings,
      suppressWhenUnfocused: false,
    });
    recordLocalNotificationDeliveryTrace({
      notificationRecipientId: item.recipientId,
      eventId: item.eventId,
      transport: "in_app",
      stage: "client_route",
      decision: result.played ? "send" : "skip",
      reasonCode: result.reasonCode,
      details: { kind: item.kind, allowInAppSound: result.played },
    });
  }
}

export function resetNotificationSoundSyncState(
  state: NotificationSoundSyncState,
): void {
  state.bootstrapped = false;
  state.knownRecipientIds = new Set();
}
