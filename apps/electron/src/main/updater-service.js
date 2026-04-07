const { updateElectronApp, UpdateSourceType } = require('update-electron-app');

const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin']);
const MANUAL_UPDATE_CHECK_TIMEOUT_MS = 15_000;

function createUpdaterService({ app, autoUpdater, settingsStore, repository }) {
  let initialized = false;
  let listenersAttached = false;
  let disableNeedsRestart = false;
  let manualCheckPromise = null;

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

  const waitForManualCheckResult = () =>
    new Promise((resolve) => {
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        autoUpdater.off('update-available', handleTerminal);
        autoUpdater.off('update-not-available', handleTerminal);
        autoUpdater.off('update-downloaded', handleTerminal);
        autoUpdater.off('error', handleTerminal);
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(getStatus());
      };

      const handleTerminal = () => {
        finish();
      };

      autoUpdater.on('update-available', handleTerminal);
      autoUpdater.on('update-not-available', handleTerminal);
      autoUpdater.on('update-downloaded', handleTerminal);
      autoUpdater.on('error', handleTerminal);

      timeoutId = setTimeout(() => {
        applyStatus('error', {
          lastError:
            'Update check timed out. The release may not be available yet. Try again in a moment.',
        });
        finish();
      }, MANUAL_UPDATE_CHECK_TIMEOUT_MS);
    });

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

    if (manualCheckPromise) {
      return manualCheckPromise;
    }

    try {
      applyStatus('checking', {
        lastCheckedAt: new Date().toISOString(),
        lastError: null,
      });
      manualCheckPromise = waitForManualCheckResult().finally(() => {
        manualCheckPromise = null;
      });
      autoUpdater.checkForUpdates();
    } catch (error) {
      manualCheckPromise = null;
      applyStatus('error', {
        lastError: error instanceof Error ? error.message : String(error),
      });
      return getStatus();
    }

    return manualCheckPromise;
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
