import React from 'react';
import { desktopClient } from '@/shared/desktop/client';
import type {
  AppSettings,
  NotificationAudioSettings,
  UpdaterStatus,
  VoiceSettings,
} from '@/shared/desktop/types';
import { getErrorMessage } from '@/shared/lib/errors';
import { DEFAULT_APP_SETTINGS, DEFAULT_VOICE_SETTINGS } from '@/renderer/app/constants';

const WEB_NOTIFICATION_AUDIO_SETTINGS_STORAGE_KEY = 'haven:web:notification-audio-settings';
const WEB_VOICE_SETTINGS_STORAGE_KEY = 'haven:web:voice-settings';

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

const readWebNotificationAudioSettings = (): NotificationAudioSettings | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(WEB_NOTIFICATION_AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<NotificationAudioSettings>;
    if (
      typeof parsed.masterSoundEnabled !== 'boolean' ||
      typeof parsed.playSoundsWhenFocused !== 'boolean' ||
      typeof parsed.notificationSoundVolume !== 'number' ||
      !Number.isFinite(parsed.notificationSoundVolume)
    ) {
      return null;
    }

    return {
      masterSoundEnabled: parsed.masterSoundEnabled,
      playSoundsWhenFocused: parsed.playSoundsWhenFocused,
      notificationSoundVolume: Math.max(0, Math.min(100, Math.round(parsed.notificationSoundVolume))),
    };
  } catch {
    return null;
  }
};

const writeWebNotificationAudioSettings = (values: NotificationAudioSettings) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(WEB_NOTIFICATION_AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ignore storage failures (quota/private mode) and keep in-memory settings.
  }
};

const readWebVoiceSettings = (): VoiceSettings | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(WEB_VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    const transmissionMode = parsed.transmissionMode;
    if (
      transmissionMode !== 'open_mic' &&
      transmissionMode !== 'voice_activity' &&
      transmissionMode !== 'push_to_talk'
    ) {
      return null;
    }

    if (
      typeof parsed.preferredInputDeviceId !== 'string' ||
      typeof parsed.preferredOutputDeviceId !== 'string' ||
      parsed.preferredInputDeviceId.trim().length === 0 ||
      parsed.preferredOutputDeviceId.trim().length === 0
    ) {
      return null;
    }

    if (
      typeof parsed.voiceActivationThreshold !== 'number' ||
      !Number.isFinite(parsed.voiceActivationThreshold)
    ) {
      return null;
    }

    const roundedThreshold = Math.max(0, Math.min(100, Math.round(parsed.voiceActivationThreshold)));

    let pushToTalkBinding: VoiceSettings['pushToTalkBinding'] = null;
    if (parsed.pushToTalkBinding != null) {
      const binding = parsed.pushToTalkBinding as Partial<NonNullable<VoiceSettings['pushToTalkBinding']>>;
      if (typeof binding.code !== 'string' || binding.code.trim().length === 0) {
        return null;
      }
      pushToTalkBinding = {
        code: binding.code.trim(),
        key: typeof binding.key === 'string' && binding.key.trim().length > 0 ? binding.key.trim() : null,
        ctrlKey: Boolean(binding.ctrlKey),
        altKey: Boolean(binding.altKey),
        shiftKey: Boolean(binding.shiftKey),
        metaKey: Boolean(binding.metaKey),
        label:
          typeof binding.label === 'string' && binding.label.trim().length > 0
            ? binding.label.trim()
            : binding.code.trim(),
      };
    }

    return {
      preferredInputDeviceId: parsed.preferredInputDeviceId.trim(),
      preferredOutputDeviceId: parsed.preferredOutputDeviceId.trim(),
      transmissionMode,
      voiceActivationThreshold: roundedThreshold,
      pushToTalkBinding,
    };
  } catch {
    return null;
  }
};

const writeWebVoiceSettings = (values: VoiceSettings) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(WEB_VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ignore storage failures (quota/private mode) and keep in-memory settings.
  }
};

export function useDesktopSettings() {
  const [appSettings, setAppSettings] = React.useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS,
    notifications: { ...DEFAULT_APP_SETTINGS.notifications },
    voice: { ...DEFAULT_APP_SETTINGS.voice },
  });
  const [appSettingsLoading, setAppSettingsLoading] = React.useState(true);
  const [updaterStatus, setUpdaterStatus] = React.useState<UpdaterStatus | null>(null);
  const [updaterStatusLoading, setUpdaterStatusLoading] = React.useState(true);
  const [checkingForUpdates, setCheckingForUpdates] = React.useState(false);
  const [notificationAudioSettingsSaving, setNotificationAudioSettingsSaving] = React.useState(false);
  const [notificationAudioSettingsError, setNotificationAudioSettingsError] = React.useState<string | null>(
    null
  );
  const [voiceSettingsSaving, setVoiceSettingsSaving] = React.useState(false);
  const [voiceSettingsError, setVoiceSettingsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    const loadDesktopSettings = async () => {
      if (!desktopClient.isAvailable()) {
        if (!isMounted) return;
        const webNotificationAudioSettings = readWebNotificationAudioSettings();
        const webVoiceSettings = readWebVoiceSettings();
        setAppSettings({
          ...DEFAULT_APP_SETTINGS,
          autoUpdateEnabled: false,
          notifications: webNotificationAudioSettings ?? { ...DEFAULT_APP_SETTINGS.notifications },
          voice: webVoiceSettings ?? { ...DEFAULT_VOICE_SETTINGS },
        });
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
    if (!desktopClient.isAvailable()) {
      setAppSettings((current) => ({ ...current, autoUpdateEnabled: false }));
      setUpdaterStatus(makeFallbackUpdaterStatus('unsupported_platform', 'Desktop bridge unavailable.'));
      return;
    }

    const result = await desktopClient.setAutoUpdateEnabled(enabled);
    setAppSettings(result.settings);
    setUpdaterStatus(result.updaterStatus);
  }, []);

  const setNotificationAudioSettings = React.useCallback(async (values: NotificationAudioSettings) => {
    setNotificationAudioSettingsSaving(true);
    setNotificationAudioSettingsError(null);
    try {
      if (!desktopClient.isAvailable()) {
        writeWebNotificationAudioSettings(values);
        setAppSettings((current) => ({
          ...current,
          notifications: {
            ...values,
          },
        }));
        return;
      }

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

  const setVoiceSettings = React.useCallback(async (values: VoiceSettings) => {
    setVoiceSettingsSaving(true);
    setVoiceSettingsError(null);
    try {
      if (!desktopClient.isAvailable()) {
        writeWebVoiceSettings(values);
        setAppSettings((current) => ({
          ...current,
          voice: {
            ...values,
          },
        }));
        return;
      }

      const result = await desktopClient.setVoiceSettings(values);
      setAppSettings(result.settings);
    } catch (error) {
      setVoiceSettingsError(getErrorMessage(error, 'Failed to update voice settings.'));
    } finally {
      setVoiceSettingsSaving(false);
    }
  }, []);

  const checkForUpdatesNow = React.useCallback(async () => {
    setCheckingForUpdates(true);
    try {
      if (!desktopClient.isAvailable()) {
        setUpdaterStatus(makeFallbackUpdaterStatus('unsupported_platform', 'Desktop bridge unavailable.'));
        return;
      }

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
      voiceSettingsSaving,
      voiceSettingsError,
    },
    derived: {},
    actions: {
      setAutoUpdateEnabled,
      setNotificationAudioSettings,
      setVoiceSettings,
      checkForUpdatesNow,
      setAppSettings,
      setUpdaterStatus,
    },
  };
}
