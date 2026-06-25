import type { NotificationAudioSettings } from "@shared/types/settings";

/** In-app sounds off until a mobile settings surface persists desktop-parity audio prefs. */
export const MOBILE_DEFAULT_NOTIFICATION_AUDIO: NotificationAudioSettings = {
  masterSoundEnabled: false,
  notificationSoundVolume: 0.8,
  voicePresenceSoundEnabled: false,
  voicePresenceSoundVolume: 0.8,
  playSoundsWhenFocused: false,
};
