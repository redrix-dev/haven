import type {
  NotificationCounts,
  SocialCounts,
} from '@/lib/backend/types';
import type { AppSettings, NotificationAudioSettings, VoiceSettings } from '@/shared/desktop/types';

export const ENABLE_CHANNEL_RELOAD_DIAGNOSTICS =
  typeof process !== 'undefined' && process.env.HAVEN_DEBUG_CHANNEL_RELOADS === '1';

export const MESSAGE_PAGE_SIZE = 75;
export const FRIENDS_SOCIAL_PANEL_FLAG = 'friends_dms_v1';
export const DM_REPORT_REVIEW_PANEL_FLAG = 'dm_report_review_v1';
export const VOICE_HARDWARE_DEBUG_PANEL_FLAG = 'debug_voice_hardware_panel';
export const VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL = 'Ctrl/Cmd + Alt + Shift + V';

export const DEFAULT_NOTIFICATION_AUDIO_SETTINGS: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 70,
  playSoundsWhenFocused: true,
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  preferredInputDeviceId: 'default',
  preferredOutputDeviceId: 'default',
  transmissionMode: 'voice_activity',
  voiceActivationThreshold: 18,
  pushToTalkBinding: {
    code: 'F13',
    key: 'F13',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    label: 'F13',
  },
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 3,
  autoUpdateEnabled: true,
  notifications: { ...DEFAULT_NOTIFICATION_AUDIO_SETTINGS },
  voice: { ...DEFAULT_VOICE_SETTINGS },
};

export const DEFAULT_NOTIFICATION_COUNTS: NotificationCounts = {
  unseenCount: 0,
  unreadCount: 0,
};

export const DEFAULT_SOCIAL_COUNTS: SocialCounts = {
  friendsCount: 0,
  incomingPendingRequestCount: 0,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 0,
};
