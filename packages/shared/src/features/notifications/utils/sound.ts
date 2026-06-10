import { RUNTIME_AUDIO_URLS } from "@platform/assets/runtimeAudio";
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

let lastPlayedAt = 0;
const MIN_SOUND_INTERVAL_MS = 500;

const SOUND_CONFIG_BY_EVENT: Record<
  AppSoundEvent,
  {
    url: string;
    getVolume: (audioSettings: NotificationAudioSettings) => number;
    enabledWhen: (audioSettings: NotificationAudioSettings) => boolean;
  }
> = {
  friend_request_received: {
    url: RUNTIME_AUDIO_URLS.notifications.default,
    getVolume: (audioSettings) => audioSettings.notificationSoundVolume,
    enabledWhen: () => true,
  },
  friend_request_accepted: {
    url: RUNTIME_AUDIO_URLS.notifications.default,
    getVolume: (audioSettings) => audioSettings.notificationSoundVolume,
    enabledWhen: () => true,
  },
  dm_message: {
    url: RUNTIME_AUDIO_URLS.notifications.default,
    getVolume: (audioSettings) => audioSettings.notificationSoundVolume,
    enabledWhen: () => true,
  },
  channel_mention: {
    url: RUNTIME_AUDIO_URLS.notifications.default,
    getVolume: (audioSettings) => audioSettings.notificationSoundVolume,
    enabledWhen: () => true,
  },
  system: {
    url: RUNTIME_AUDIO_URLS.notifications.default,
    getVolume: (audioSettings) => audioSettings.notificationSoundVolume,
    enabledWhen: () => true,
  },
  voice_presence_join: {
    url: RUNTIME_AUDIO_URLS.voicePresence.join,
    getVolume: (audioSettings) => audioSettings.voicePresenceSoundVolume,
    enabledWhen: (audioSettings) => audioSettings.voicePresenceSoundEnabled,
  },
  voice_presence_leave: {
    url: RUNTIME_AUDIO_URLS.voicePresence.leave,
    getVolume: (audioSettings) => audioSettings.voicePresenceSoundVolume,
    enabledWhen: (audioSettings) => audioSettings.voicePresenceSoundEnabled,
  },
};

const playSoundEvent = async ({
  event,
  deliverSound,
  audioSettings,
  suppressWhenUnfocused,
}: {
  event: AppSoundEvent;
  deliverSound: boolean;
  audioSettings: NotificationAudioSettings;
  suppressWhenUnfocused?: boolean;
}): Promise<NotificationSoundPlayResult> => {
  const soundConfig = SOUND_CONFIG_BY_EVENT[event];

  if (!deliverSound)
    return { played: false, reasonCode: "sound_pref_disabled" };
  if (!audioSettings.masterSoundEnabled)
    return { played: false, reasonCode: "sound_pref_disabled" };
  if (!soundConfig.enabledWhen(audioSettings))
    return { played: false, reasonCode: "sound_pref_disabled" };
  // Access browser globals via globalThis so this module compiles in non-DOM
  // contexts (Electron main, backend tests) without requiring lib.dom.d.ts.
  // Structural types avoid any reference to lib.dom.d.ts names.
  type BrowserLike = {
    document?: { hasFocus: () => boolean };
     
    AudioContext?: new () => any;
  };
  const browser = globalThis as typeof globalThis & BrowserLike;

  if (
    suppressWhenUnfocused &&
    browser.document != null &&
    !browser.document.hasFocus()
  ) {
    return {
      played: false,
      reasonCode: "in_app_suppressed_due_to_push_active_background",
    };
  }
  if (
    browser.document != null &&
    browser.document.hasFocus() &&
    audioSettings.playSoundsWhenFocused === false
  ) {
    return { played: false, reasonCode: "sound_pref_disabled" };
  }

  const now = Date.now();
  if (now - lastPlayedAt < MIN_SOUND_INTERVAL_MS) {
    return { played: false, reasonCode: "sound_pref_disabled" };
  }

  const volume = Math.max(
    0,
    Math.min(100, Math.round(soundConfig.getVolume(audioSettings))),
  );
  if (volume === 0) return { played: false, reasonCode: "sound_pref_disabled" };

  if (!browser.AudioContext) return { played: false, reasonCode: "sound_pref_disabled" };

  try {
    const audioContext = new browser.AudioContext();
    const response = await fetch(soundConfig.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    gainNode.gain.value = volume / 100;
    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);

    source.onended = () => audioContext.close();

    lastPlayedAt = now;
    return { played: true, reasonCode: "sent" };
  } catch (error) {
    console.warn("Failed to play notification sound:", error);
    return { played: false, reasonCode: "provider_retryable_failure" };
  }
};

export const playVoicePresenceSound = async ({
  event,
  audioSettings,
}: VoicePresenceSoundRequest): Promise<NotificationSoundPlayResult> =>
  playSoundEvent({
    event,
    deliverSound: true,
    audioSettings,
  });

export const playNotificationSound = async ({
  kind,
  deliverSound,
  audioSettings,
  suppressWhenUnfocused,
}: NotificationSoundRequest): Promise<NotificationSoundPlayResult> =>
  playSoundEvent({
    event: kind,
    deliverSound,
    audioSettings,
    suppressWhenUnfocused,
  });
