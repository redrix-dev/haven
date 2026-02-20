import type { AppSettings, DesktopAPI, UpdaterStatus } from './types';

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
  async getUpdaterStatus(): Promise<UpdaterStatus> {
    return getDesktopApi().getUpdaterStatus();
  },
  async checkForUpdates(): Promise<UpdaterStatus> {
    return getDesktopApi().checkForUpdates();
  },
  async consumeNextProtocolUrl(): Promise<string | null> {
    return getDesktopApi().consumeNextProtocolUrl();
  },
  onProtocolUrl(listener: (url: string) => void): () => void {
    return getDesktopApi().onProtocolUrl(listener);
  },
};
