const path = require('node:path');
const { systemPreferences } = require('electron');
const { registerDesktopIpcHandlers } = require('../ipc/register-desktop-ipc-handlers');
const { registerRendererDocumentHeaderPolicy } = require('./register-header-policy');
const { registerPermissionHandlers } = require('./register-permission-handlers');

/**
 * On macOS, Electron's session permission handlers alone are not enough —
 * the OS also checks its own privacy grant. Ask for microphone access at
 * startup so the system permission dialog appears before the user ever
 * tries to join a voice channel.
 */
async function ensureMicrophonePermission() {
  if (process.platform !== 'darwin') return;
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone');
    }
  } catch (err) {
    console.warn('[permissions] Could not request microphone access:', err);
  }
}

const registerHavenProtocolClient = (app) => {
  if (process.platform === 'win32' && process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('haven', process.execPath, [path.resolve(process.argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient('haven');
};

const startMainRuntime = async ({
  app,
  sessionRef,
  ipcMain,
  settingsStore,
  updaterService,
  getMainWindow,
  pendingProtocolUrls,
  voicePopoutWindowManager,
  mainWindowWebpackEntry,
}) => {
  registerHavenProtocolClient(app);
  settingsStore.initialize();
  updaterService.initialize();

  // Request macOS microphone permission early so getUserMedia in the renderer
  // doesn't get blocked by the OS when the user first joins a voice channel.
  await ensureMicrophonePermission();

  registerDesktopIpcHandlers({
    ipcMain,
    settingsStore,
    updaterService,
    getMainWindow,
    pendingProtocolUrls,
    voicePopoutWindowManager,
  });

  registerRendererDocumentHeaderPolicy({
    sessionRef,
    rendererDocumentUrls: [mainWindowWebpackEntry],
    rendererOriginUrl: mainWindowWebpackEntry,
  });

  registerPermissionHandlers({
    sessionRef,
  });
};

module.exports = {
  startMainRuntime,
};
