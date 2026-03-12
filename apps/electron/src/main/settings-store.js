const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_SCHEMA_VERSION = 3;

const DEFAULT_APP_SETTINGS = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  autoUpdateEnabled: true,
  notifications: {
    masterSoundEnabled: true,
    notificationSoundVolume: 70,
    playSoundsWhenFocused: true,
  },
  voice: {
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
  },
};

const SETTINGS_FILE_NAME = 'app-settings.json';

function createSettingsStore(app) {
  let cachedSettings = null;

  const settingsFilePath = () => path.join(app.getPath('userData'), SETTINGS_FILE_NAME);

  const normalizeSettings = (raw) => {
    const candidate = raw && typeof raw === 'object' ? raw : {};
    const candidateNotifications =
      candidate.notifications && typeof candidate.notifications === 'object'
        ? candidate.notifications
        : {};
    const candidateVoice =
      candidate.voice && typeof candidate.voice === 'object'
        ? candidate.voice
        : {};
    const normalizedVolume = Number(candidateNotifications.notificationSoundVolume);
    const normalizedVoiceActivationThreshold = Number(candidateVoice.voiceActivationThreshold);
    const candidatePushToTalkBinding =
      candidateVoice.pushToTalkBinding && typeof candidateVoice.pushToTalkBinding === 'object'
        ? candidateVoice.pushToTalkBinding
        : null;
    const normalizedPushToTalkBinding =
      candidatePushToTalkBinding &&
      typeof candidatePushToTalkBinding.code === 'string' &&
      candidatePushToTalkBinding.code.trim().length > 0
        ? {
            code: candidatePushToTalkBinding.code.trim(),
            key:
              typeof candidatePushToTalkBinding.key === 'string' &&
              candidatePushToTalkBinding.key.trim().length > 0
                ? candidatePushToTalkBinding.key.trim()
                : null,
            ctrlKey: Boolean(candidatePushToTalkBinding.ctrlKey),
            altKey: Boolean(candidatePushToTalkBinding.altKey),
            shiftKey: Boolean(candidatePushToTalkBinding.shiftKey),
            metaKey: Boolean(candidatePushToTalkBinding.metaKey),
            label:
              typeof candidatePushToTalkBinding.label === 'string' &&
              candidatePushToTalkBinding.label.trim().length > 0
                ? candidatePushToTalkBinding.label.trim()
                : candidatePushToTalkBinding.code.trim(),
          }
        : DEFAULT_APP_SETTINGS.voice.pushToTalkBinding;
    const normalizedTransmissionMode =
      candidateVoice.transmissionMode === 'open_mic' ||
      candidateVoice.transmissionMode === 'voice_activity' ||
      candidateVoice.transmissionMode === 'push_to_talk'
        ? candidateVoice.transmissionMode
        : DEFAULT_APP_SETTINGS.voice.transmissionMode;
    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      autoUpdateEnabled:
        typeof candidate.autoUpdateEnabled === 'boolean'
          ? candidate.autoUpdateEnabled
          : DEFAULT_APP_SETTINGS.autoUpdateEnabled,
      notifications: {
        masterSoundEnabled:
          typeof candidateNotifications.masterSoundEnabled === 'boolean'
            ? candidateNotifications.masterSoundEnabled
            : DEFAULT_APP_SETTINGS.notifications.masterSoundEnabled,
        notificationSoundVolume:
          Number.isFinite(normalizedVolume) && normalizedVolume >= 0 && normalizedVolume <= 100
            ? Math.round(normalizedVolume)
            : DEFAULT_APP_SETTINGS.notifications.notificationSoundVolume,
        playSoundsWhenFocused:
          typeof candidateNotifications.playSoundsWhenFocused === 'boolean'
            ? candidateNotifications.playSoundsWhenFocused
            : DEFAULT_APP_SETTINGS.notifications.playSoundsWhenFocused,
      },
      voice: {
        preferredInputDeviceId:
          typeof candidateVoice.preferredInputDeviceId === 'string' &&
          candidateVoice.preferredInputDeviceId.trim().length > 0
            ? candidateVoice.preferredInputDeviceId.trim()
            : DEFAULT_APP_SETTINGS.voice.preferredInputDeviceId,
        preferredOutputDeviceId:
          typeof candidateVoice.preferredOutputDeviceId === 'string' &&
          candidateVoice.preferredOutputDeviceId.trim().length > 0
            ? candidateVoice.preferredOutputDeviceId.trim()
            : DEFAULT_APP_SETTINGS.voice.preferredOutputDeviceId,
        transmissionMode: normalizedTransmissionMode,
        voiceActivationThreshold:
          Number.isFinite(normalizedVoiceActivationThreshold) &&
          normalizedVoiceActivationThreshold >= 0 &&
          normalizedVoiceActivationThreshold <= 100
            ? Math.round(normalizedVoiceActivationThreshold)
            : DEFAULT_APP_SETTINGS.voice.voiceActivationThreshold,
        pushToTalkBinding: normalizedPushToTalkBinding,
      },
    };
  };

  const persistSettings = (settings) => {
    const targetPath = settingsFilePath();
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const tempPath = `${targetPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tempPath, targetPath);
  };

  const readSettingsFromDisk = () => {
    const targetPath = settingsFilePath();

    if (!fs.existsSync(targetPath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const initialize = () => {
    const onDisk = readSettingsFromDisk();
    const normalized = normalizeSettings(onDisk);
    cachedSettings = normalized;
    persistSettings(normalized);
    return cachedSettings;
  };

  const getSettings = () => {
    if (!cachedSettings) {
      return initialize();
    }

    return cachedSettings;
  };

  const updateSettings = (patch) => {
    const current = getSettings();
    const merged = {
      ...current,
      ...(patch && typeof patch === 'object' ? patch : {}),
    };

    const normalized = normalizeSettings(merged);
    cachedSettings = normalized;
    persistSettings(normalized);
    return cachedSettings;
  };

  return {
    initialize,
    getSettings,
    updateSettings,
  };
}

module.exports = {
  createSettingsStore,
  SETTINGS_SCHEMA_VERSION,
  DEFAULT_APP_SETTINGS,
};
