const path = require('node:path');
const { registerDesktopIpcHandlers } = require('../ipc/register-desktop-ipc-handlers');
const { registerRendererDocumentHeaderPolicy } = require('./register-header-policy');
const { registerPermissionHandlers } = require('./register-permission-handlers');

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
