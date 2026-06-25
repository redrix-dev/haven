import type { NotificationAudioSettings } from "@shared/types/settings";
import type { NotificationKind } from "@shared/lib/backend/types";
import type { NotificationDeliveryReasonCode } from "@shared/features/notifications/utils/routePolicy";

type NotificationSoundRequest = {
  kind: NotificationKind;
  deliverSound: boolean;
  audioSettings: NotificationAudioSettings;
  suppressWhenUnfocused?: boolean;
};

type VoicePresenceSoundRequest = {
  event: VoicePresenceSoundEvent;
  audioSettings: NotificationAudioSettings;
};

export type VoicePresenceSoundEvent =
  | "voice_presence_join"
  | "voice_presence_leave";
export type AppSoundEvent = NotificationKind | VoicePresenceSoundEvent;

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

export const playVoicePresenceSound = async ({
  event,
  audioSettings,
}: VoicePresenceSoundRequest): Promise<NotificationSoundPlayResult> =>
  getSkippedResult(
    audioSettings,
    event === "voice_presence_join" || event === "voice_presence_leave"
      ? audioSettings.voicePresenceSoundEnabled
      : false,
  );

export const playNotificationSound = async ({
  deliverSound,
  audioSettings,
}: NotificationSoundRequest): Promise<NotificationSoundPlayResult> =>
  getSkippedResult(audioSettings, true, deliverSound);
