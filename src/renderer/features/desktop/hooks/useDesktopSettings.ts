import React from 'react';
import { desktopClient } from '@/shared/desktop/client';
import type { AppSettings, NotificationAudioSettings, UpdaterStatus } from '@/shared/desktop/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { DEFAULT_APP_SETTINGS } from '@/renderer/app/constants';

const makeFallbackUpdaterStatus = (
  status: UpdaterStatus['status'],
  lastError: string | null
): UpdaterStatus => ({
  supported: false,
  isPackaged: false,
  platform: 'unknown',
  enabled: false,
  initialized: false,
  status,
  lastCheckedAt: null,
  lastError,
  disableNeedsRestart: false,
  repository: 'redrix-dev/haven',
});

export function useDesktopSettings() {
  const [appSettings, setAppSettings] = React.useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS,
    notifications: { ...DEFAULT_APP_SETTINGS.notifications },
  });
  const [appSettingsLoading, setAppSettingsLoading] = React.useState(true);
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);
  const [updaterStatusLoading, setUpdaterStatusLoading] = React.useState(true);
  const [checkingForUpdates, setCheckingForUpdates] = React.useState(false);
  const [notificationAudioSettingsSaving, setNotificationAudioSettingsSaving] = React.useState(false);
  const [notificationAudioSettingsError, setNotificationAudioSettingsError] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    let isMounted = true;

    const loadDesktopSettings = async () => {
      if (!desktopClient.isAvailable()) {
        if (!isMounted) return;
        setAppSettingsLoading(false);
        setUpdaterStatusLoading(false);
        setUpdaterStatus(makeFallbackUpdaterStatus('unsupported_platform', 'Desktop bridge unavailable.'));
        return;
      }

      const [settingsResult, updaterResult] = await Promise.allSettled([
        desktopClient.getAppSettings(),
        desktopClient.getUpdaterStatus(),
      ]);

      if (!isMounted) return;

      if (settingsResult.status === 'fulfilled') {
        setAppSettings(settingsResult.value);
      }
      setAppSettingsLoading(false);

      if (updaterResult.status === 'fulfilled') {
        setUpdaterStatus(updaterResult.value);
      } else {
        setUpdaterStatus(
          makeFallbackUpdaterStatus(
            'error',
            updaterResult.reason instanceof Error
              ? updaterResult.reason.message
              : String(updaterResult.reason)
          )
        );
      }

      setUpdaterStatusLoading(false);
    };

    void loadDesktopSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const setAutoUpdateEnabled = React.useCallback(async (enabled: boolean) => {
    const result = await desktopClient.setAutoUpdateEnabled(enabled);
    setAppSettings(result.settings);
    setUpdaterStatus(result.updaterStatus);
  }, []);

  const setNotificationAudioSettings = React.useCallback(async (values: NotificationAudioSettings) => {
    setNotificationAudioSettingsSaving(true);
    setNotificationAudioSettingsError(null);
    try {
      const result = await desktopClient.setNotificationAudioSettings(values);
      setAppSettings(result.settings);
    } catch (error) {
      setNotificationAudioSettingsError(
        getErrorMessage(error, 'Failed to update local notification audio settings.')
      );
    } finally {
      setNotificationAudioSettingsSaving(false);
    }
  }, []);

  const checkForUpdatesNow = React.useCallback(async () => {
    setCheckingForUpdates(true);
    try {
      const status = await desktopClient.checkForUpdates();
      setUpdaterStatus(status);
    } finally {
      setCheckingForUpdates(false);
    }
  }, []);

  return {
    state: {
      appSettings,
      appSettingsLoading,
      updaterStatus,
      updaterStatusLoading,
      checkingForUpdates,
      notificationAudioSettingsSaving,
      notificationAudioSettingsError,
    },
    derived: {},
    actions: {
      setAutoUpdateEnabled,
      setNotificationAudioSettings,
      checkForUpdatesNow,
      setAppSettings,
      setUpdaterStatus,
    },
  };
}
