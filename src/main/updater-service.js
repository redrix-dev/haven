const { updateElectronApp, UpdateSourceType } = require('update-electron-app');

const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin']);

function createUpdaterService({ app, autoUpdater, settingsStore, repository }) {
  let initialized = false;
  let listenersAttached = false;
  let disableNeedsRestart = false;

  const state = {
    supported: SUPPORTED_PLATFORMS.has(process.platform),
    isPackaged: app.isPackaged,
    platform: process.platform,
    enabled: false,
    initialized: false,
    status: 'idle',
    lastCheckedAt: null,
    lastError: null,
    disableNeedsRestart: false,
    repository,
  };

  const applyStatus = (status, patch = {}) => {
    state.status = status;
    Object.assign(state, patch);
  };

  const attachAutoUpdaterListeners = () => {
    if (listenersAttached) return;
    listenersAttached = true;

    autoUpdater.on('checking-for-update', () => {
      applyStatus('checking', {
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
    });

    autoUpdater.on('update-available', () => {
      applyStatus('update_available', {
        lastError: null,
      });
    });

    autoUpdater.on('update-not-available', () => {
      applyStatus('up_to_date', {
        lastError: null,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      applyStatus('update_downloaded', {
        lastError: null,
      });
    });

    autoUpdater.on('error', (error) => {
      applyStatus('error', {
        lastError: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const startUpdater = () => {
    if (initialized) return;

    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: repository,
      },
      updateInterval: '30 minutes',
      notifyUser: true,
      logger: console,
    });

    initialized = true;
    state.initialized = true;
    attachAutoUpdaterListeners();
  };

  const syncWithSettings = () => {
    const settings = settingsStore.getSettings();
    state.enabled = Boolean(settings.autoUpdateEnabled);
    state.disableNeedsRestart = disableNeedsRestart;

    if (!state.supported) {
      applyStatus('unsupported_platform');
      return getStatus();
    }

    if (!state.isPackaged) {
      applyStatus('dev_mode');
      return getStatus();
    }

    if (!state.enabled) {
      if (initialized) {
        disableNeedsRestart = true;
        state.disableNeedsRestart = true;
        applyStatus('disabled_pending_restart');
      } else {
        applyStatus('disabled');
      }
      return getStatus();
    }

    if (!initialized) {
      try {
        startUpdater();
      } catch (error) {
        applyStatus('error', {
          lastError: error instanceof Error ? error.message : String(error),
        });
        return getStatus();
      }
    }

    disableNeedsRestart = false;
    state.disableNeedsRestart = false;
    applyStatus('ready');
    return getStatus();
  };

  const checkForUpdatesNow = async () => {
    const status = syncWithSettings();

    if (
      status.status === 'unsupported_platform' ||
      status.status === 'dev_mode' ||
      status.status === 'disabled' ||
      status.status === 'disabled_pending_restart'
    ) {
      return status;
    }

    try {
      applyStatus('checking', {
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
      autoUpdater.checkForUpdates();
    } catch (error) {
      applyStatus('error', {
        lastError: error instanceof Error ? error.message : String(error),
      });
    }

    return getStatus();
  };

  const initialize = () => syncWithSettings();

  const getStatus = () => ({
    ...state,
  });

  return {
    initialize,
    syncWithSettings,
    checkForUpdatesNow,
    getStatus,
  };
}

module.exports = {
  createUpdaterService,
};

