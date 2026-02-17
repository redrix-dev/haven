export type AppSettings = {
  schemaVersion: number;
  autoUpdateEnabled: boolean;
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

export type DesktopBridgeApi = {
  getAppSettings: () => Promise<AppSettings>;
  setAutoUpdateEnabled: (enabled: boolean) => Promise<{
    settings: AppSettings;
    updaterStatus: UpdaterStatus;
  }>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  checkForUpdates: () => Promise<UpdaterStatus>;
};

declare global {
  interface Window {
    havenDesktop?: DesktopBridgeApi;
  }
}

