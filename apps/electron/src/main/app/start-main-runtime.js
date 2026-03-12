const path = require('node:path');
const { createRendererEntryService } = require('../renderer-entry-service');
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
  shouldDebugRendererEntry,
  devRendererEntryPortOverride,
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
  });

  const rendererEntryService = createRendererEntryService({
    entries: [
      {
        entryName: 'main_window',
        webpackEntryUrl: mainWindowWebpackEntry,
      },
    ],
    ...(devRendererEntryPortOverride ? { port: devRendererEntryPortOverride } : {}),
    debug: shouldDebugRendererEntry,
  });
  await rendererEntryService.start();

  registerRendererDocumentHeaderPolicy({
    sessionRef,
    rendererEntryServiceRef: rendererEntryService,
  });

  registerPermissionHandlers({
    sessionRef,
  });

  return rendererEntryService;
};

module.exports = {
  startMainRuntime,
};
