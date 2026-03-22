import type {
  AppSettings,
  DesktopAPI,
  NotificationAudioSettings,
  SaveFileFromUrlResult,
  UpdaterStatus,
  VoicePopoutControlAction,
  VoicePopoutState,
  VoiceSettings,
} from './types';

const DESKTOP_BRIDGE_UNAVAILABLE_ERROR = 'Desktop bridge unavailable.';

const getDesktopApi = (): DesktopAPI => {
  const api = window.desktop;
  if (!api) {
    throw new Error(DESKTOP_BRIDGE_UNAVAILABLE_ERROR);
  }
  return api;
};

export const desktopClient = {
  isAvailable(): boolean {
    return Boolean(window.desktop);
  },
  async getAppSettings(): Promise<AppSettings> {
    return getDesktopApi().getAppSettings();
  },
  async setAutoUpdateEnabled(enabled: boolean): Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }> {
    return getDesktopApi().setAutoUpdateEnabled(enabled);
  },
  async setNotificationAudioSettings(input: NotificationAudioSettings): Promise<{
    settings: AppSettings;
  }> {
    return getDesktopApi().setNotificationAudioSettings(input);
  },
  async setVoiceSettings(input: VoiceSettings): Promise<{
    settings: AppSettings;
  }> {
    return getDesktopApi().setVoiceSettings(input);
  },
  async getUpdaterStatus(): Promise<UpdaterStatus> {
    return getDesktopApi().getUpdaterStatus();
  },
  async checkForUpdates(): Promise<UpdaterStatus> {
    return getDesktopApi().checkForUpdates();
  },
  async saveFileFromUrl(input: {
    url: string;
    suggestedName?: string | null;
  }): Promise<SaveFileFromUrlResult> {
    return getDesktopApi().saveFileFromUrl(input);
  },
  async consumeNextProtocolUrl(): Promise<string | null> {
    return getDesktopApi().consumeNextProtocolUrl();
  },

  async openVoicePopout(): Promise<{ opened: boolean }> {
    return getDesktopApi().openVoicePopout();
  },
  async closeVoicePopout(): Promise<{ closed: boolean }> {
    return getDesktopApi().closeVoicePopout();
  },
  async syncVoicePopoutState(state: VoicePopoutState): Promise<void> {
    return getDesktopApi().syncVoicePopoutState(state);
  },
  async requestVoicePopoutStateSync(): Promise<void> {
    return getDesktopApi().requestVoicePopoutStateSync();
  },
  async dispatchVoicePopoutControlAction(action: VoicePopoutControlAction): Promise<void> {
    return getDesktopApi().dispatchVoicePopoutControlAction(action);
  },
  onProtocolUrl(listener: (url: string) => void): () => void {
    return getDesktopApi().onProtocolUrl(listener);
  },

  onVoicePopoutState(listener: (state: VoicePopoutState) => void): () => void {
    return getDesktopApi().onVoicePopoutState(listener);
  },
  onVoicePopoutControlAction(listener: (action: VoicePopoutControlAction) => void): () => void {
    return getDesktopApi().onVoicePopoutControlAction(listener);
  },
};
