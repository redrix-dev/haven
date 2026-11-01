import type { NotificationAudioSettings } from "@shared/types/settings";
import type { NotificationKind } from "@shared/lib/backend/types";
import type { NotificationDeliveryReasonCode } from "@shared/features/notifications/utils/routePolicy";

type NotificationSoundRequest = {
  kind: NotificationKind;
  deliverSound: boolean;
  audioSettings: NotificationAudioSettings;
  suppressWhenUnfocused?: boolean;
};

export type AppSoundEvent = NotificationKind;

export type NotificationSoundPlayResult = {
  played: boolean;
  reasonCode: NotificationDeliveryReasonCode;
};

const getSkippedResult = (
  audioSettings: NotificationAudioSettings,
  enabledWhen: boolean,
  deliverSound = true,
): NotificationSoundPlayResult => {
  if (!deliverSound) {
    return { played: false, reasonCode: "sound_pref_disabled" };
  }
  if (!audioSettings.masterSoundEnabled) {
    return { played: false, reasonCode: "sound_pref_disabled" };
  }
  if (!enabledWhen) {
    return { played: false, reasonCode: "sound_pref_disabled" };
  }
  return { played: false, reasonCode: "provider_retryable_failure" };
};

export const playNotificationSound = async ({
  deliverSound,
  audioSettings,
}: NotificationSoundRequest): Promise<NotificationSoundPlayResult> =>
  getSkippedResult(audioSettings, true, deliverSound);
