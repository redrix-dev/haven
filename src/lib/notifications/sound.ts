import defaultNotificationSoundUrl from '@/assets/audio/notifications/default-notification.mp3';
import type { NotificationAudioSettings } from '@/shared/desktop/types';
import type { NotificationKind } from '@/lib/backend/types';

type NotificationSoundRequest = {
  kind: NotificationKind;
  deliverSound: boolean;
  audioSettings: NotificationAudioSettings;
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
}: NotificationSoundRequest): Promise<void> => {
  if (!deliverSound) return;
  if (!audioSettings.masterSoundEnabled) return;
  if (
    typeof document !== 'undefined' &&
    document.hasFocus() &&
    audioSettings.playSoundsWhenFocused === false
  ) {
    return;
  }

  const now = Date.now();
  if (now - lastPlayedAt < MIN_SOUND_INTERVAL_MS) return;

  const volume = Math.max(0, Math.min(100, Math.round(audioSettings.notificationSoundVolume)));
  if (volume === 0) return;

  const url = SOUND_URL_BY_KIND[kind] ?? defaultNotificationSoundUrl;
  try {
    const audio = new Audio(url);
    audio.volume = volume / 100;
    await audio.play();
    lastPlayedAt = now;
  } catch (error) {
    console.warn('Failed to play notification sound:', error);
  }
};

