import type {
  AppSettings,
  NotificationAudioSettings,
  SaveFileFromUrlResult,
  UpdaterStatus,
  VoicePopoutControlAction,
  VoicePopoutState,
  VoiceSettings,
} from "./desktop/types";

export type DesktopSettingsBridge = {
  getAppSettings: () => Promise<AppSettings>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  setAutoUpdateEnabled: (enabled: boolean) => Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }>;
  setNotificationAudioSettings: (
    values: NotificationAudioSettings,
  ) => Promise<{ settings: AppSettings }>;
  setVoiceSettings: (values: VoiceSettings) => Promise<{ settings: AppSettings }>;
  checkForUpdates: () => Promise<UpdaterStatus>;
};

export type DesktopAuthBridge = {
  onProtocolUrl: (listener: (url: string) => void) => () => void;
  consumeNextProtocolUrl: () => Promise<string | null>;
};

export type VoicePopoutBridge = {
  onVoicePopoutState: (listener: (state: VoicePopoutState) => void) => () => void;
  syncVoicePopoutState: (state: VoicePopoutState) => Promise<void>;
  onVoicePopoutControlAction: (
    listener: (action: VoicePopoutControlAction) => void,
  ) => () => void;
  openVoicePopout: () => Promise<void>;
  requestVoicePopoutStateSync: () => Promise<void>;
  dispatchVoicePopoutControlAction: (
    action: VoicePopoutControlAction,
  ) => Promise<void>;
};

export type WindowChromeBridge = {
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
};

export type AppHost = {
  isDesktopApp: () => boolean;
  openExternalUrl: (url: string) => Promise<void>;
  saveFileFromUrl: (input: {
    url: string;
    suggestedName: string;
  }) => Promise<SaveFileFromUrlResult>;
  desktopSettings?: DesktopSettingsBridge;
  desktopAuth?: DesktopAuthBridge;
  voicePopout?: VoicePopoutBridge;
  windowChrome?: WindowChromeBridge;
};

const defaultWebHost: AppHost = {
  isDesktopApp: () => false,
  openExternalUrl: async (url: string) => {
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  },
  saveFileFromUrl: async ({ url }) => {
    if (typeof window === "undefined") {
      return { saved: false, filePath: null };
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return { saved: false, filePath: null };
  },
};

let currentHost: AppHost = defaultWebHost;

export function setAppHost(host: AppHost): void {
  currentHost = host;
}

export function resetAppHostToWebDefaults(): void {
  currentHost = defaultWebHost;
}

export function getAppHost(): AppHost {
  return currentHost;
}
