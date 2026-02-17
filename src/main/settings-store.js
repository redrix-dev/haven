const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_SCHEMA_VERSION = 1;

const DEFAULT_APP_SETTINGS = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  autoUpdateEnabled: true,
};

const SETTINGS_FILE_NAME = 'app-settings.json';

function createSettingsStore(app) {
  let cachedSettings = null;

  const settingsFilePath = () => path.join(app.getPath('userData'), SETTINGS_FILE_NAME);

  const normalizeSettings = (raw) => {
    const candidate = raw && typeof raw === 'object' ? raw : {};
    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      autoUpdateEnabled:
        typeof candidate.autoUpdateEnabled === 'boolean'
          ? candidate.autoUpdateEnabled
          : DEFAULT_APP_SETTINGS.autoUpdateEnabled,
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

