export type NotificationAudioSettings = {
  masterSoundEnabled: boolean;
  notificationSoundVolume: number;
  playSoundsWhenFocused: boolean;
};

export type VoiceTransmissionMode = 'voice_activity' | 'push_to_talk' | 'open_mic';

export type VoicePushToTalkBinding = {
  code: string;
  key: string | null;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  label: string;
};

export type VoiceSettings = {
  preferredInputDeviceId: string;
  preferredOutputDeviceId: string;
  transmissionMode: VoiceTransmissionMode;
  voiceActivationThreshold: number;
  pushToTalkBinding: VoicePushToTalkBinding | null;
};

export type AppSettings = {
  schemaVersion: number;
  autoUpdateEnabled: boolean;
  notifications: NotificationAudioSettings;
  voice: VoiceSettings;
};

export type UpdaterStatus = {
  supported: boolean;
  isPackaged: boolean;
  platform: string;
  enabled: boolean;
  initialized: boolean;
  status:
    | 'idle'
    | 'ready'
    | 'checking'
    | 'update_available'
    | 'up_to_date'
    | 'update_downloaded'
    | 'error'
    | 'unsupported_platform'
    | 'dev_mode'
    | 'disabled'
    | 'disabled_pending_restart';
  lastCheckedAt: string | null;
  lastError: string | null;
  disableNeedsRestart: boolean;
  repository: string;
};

export type SaveFileFromUrlResult = {
  saved: boolean;
  filePath: string | null;
};

export type DesktopAPI = {
  getAppSettings: () => Promise<AppSettings>;
  setAutoUpdateEnabled: (enabled: boolean) => Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }>;
  setNotificationAudioSettings: (input: NotificationAudioSettings) => Promise<{
    settings: AppSettings;
  }>;
  setVoiceSettings: (input: VoiceSettings) => Promise<{
    settings: AppSettings;
  }>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  checkForUpdates: () => Promise<UpdaterStatus>;
  saveFileFromUrl: (input: {
    url: string;
    suggestedName?: string | null;
  }) => Promise<SaveFileFromUrlResult>;
  consumeNextProtocolUrl: () => Promise<string | null>;
  onProtocolUrl: (listener: (url: string) => void) => () => void;
};

declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
