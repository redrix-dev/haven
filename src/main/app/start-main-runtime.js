const { createRendererEntryService } = require('../renderer-entry-service');
const { registerDesktopIpcHandlers } = require('../ipc/register-desktop-ipc-handlers');
const { registerRendererDocumentHeaderPolicy } = require('./register-header-policy');
const { registerPermissionHandlers } = require('./register-permission-handlers');

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
  app.setAsDefaultProtocolClient('haven');
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
