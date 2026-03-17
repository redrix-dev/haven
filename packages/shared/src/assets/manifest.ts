import defaultNotificationSoundUrl from '@shared/assets/audio/notifications/default-notification.mp3';

export const AUDIO_ASSET_PATHS = {
  notifications: {
    default: defaultNotificationSoundUrl,
  },
  voicePresence: {
    join: defaultNotificationSoundUrl,
    leave: defaultNotificationSoundUrl,
  },
} as const;
