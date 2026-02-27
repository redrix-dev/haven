import defaultNotificationSoundUrl from '@/assets/audio/notifications/default-notification.mp3';
import type { NotificationAudioSettings } from '@/shared/desktop/types';
import type { NotificationKind } from '@/lib/backend/types';
import type { NotificationDeliveryReasonCode } from '@/lib/notifications/routePolicy';

type NotificationSoundRequest = {
  kind: NotificationKind;
  deliverSound: boolean;
  audioSettings: NotificationAudioSettings;
  suppressWhenUnfocused?: boolean;
};

export type NotificationSoundPlayResult = {
  played: boolean;
  reasonCode: NotificationDeliveryReasonCode;
};

let lastPlayedAt = 0;
const MIN_SOUND_INTERVAL_MS = 500;

const SOUND_URL_BY_KIND: Record<NotificationKind, string> = {
  friend_request_received: defaultNotificationSoundUrl,
  friend_request_accepted: defaultNotificationSoundUrl,
  dm_message: defaultNotificationSoundUrl,
  channel_mention: defaultNotificationSoundUrl,
  system: defaultNotificationSoundUrl,
};

export const playNotificationSound = async ({
  kind,
  deliverSound,
  audioSettings,
  suppressWhenUnfocused,
}: NotificationSoundRequest): Promise<NotificationSoundPlayResult> => {
  if (!deliverSound) return { played: false, reasonCode: 'sound_pref_disabled' };
  if (!audioSettings.masterSoundEnabled) return { played: false, reasonCode: 'sound_pref_disabled' };
  if (suppressWhenUnfocused && typeof document !== 'undefined' && !document.hasFocus()) {
    return { played: false, reasonCode: 'in_app_suppressed_due_to_push_active_background' };
  }
  if (
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    audioSettings.playSoundsWhenFocused === false
  ) {
    return { played: false, reasonCode: 'sound_pref_disabled' };
  }

  const now = Date.now();
  if (now - lastPlayedAt < MIN_SOUND_INTERVAL_MS) {
    return { played: false, reasonCode: 'sound_pref_disabled' };
  }

  const volume = Math.max(0, Math.min(100, Math.round(audioSettings.notificationSoundVolume)));
  if (volume === 0) return { played: false, reasonCode: 'sound_pref_disabled' };

  const url = SOUND_URL_BY_KIND[kind] ?? defaultNotificationSoundUrl;
  try {
    const audio = new Audio(url);
    audio.volume = volume / 100;
    await audio.play();
    lastPlayedAt = now;
    return { played: true, reasonCode: 'sent' };
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
    return { played: false, reasonCode: 'provider_retryable_failure' };
  }
};

