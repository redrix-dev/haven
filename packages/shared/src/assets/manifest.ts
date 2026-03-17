import defaultNotificationSoundUrl from "@shared/assets/audio/notifications/default-notification.mp3";
import defaultVoiceConnectSoundUrl from "@shared/assets/audio/notifications/haven-connected.mp3";
import defaultVoiceDisconnectedSoundUrl from "@shared/assets/audio/notifications/haven-disconnected.mp3";
export const AUDIO_ASSET_PATHS = {
  notifications: {
    default: defaultNotificationSoundUrl,
  },
  voicePresence: {
    join: defaultVoiceConnectSoundUrl,
    leave: defaultVoiceDisconnectedSoundUrl,
  },
} as const;
