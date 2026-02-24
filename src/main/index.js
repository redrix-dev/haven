const { app, BrowserWindow, dialog, session, ipcMain, autoUpdater } = require('electron');
const { createSettingsStore } = require('./settings-store');
const { createUpdaterService } = require('./updater-service');
const { createMainWindow } = require('./app/create-main-window');
const { registerWindowBehaviors } = require('./app/register-window-behaviors');
const { startMainRuntime } = require('./app/start-main-runtime');
const { createProtocolUrlQueue } = require('./app/protocol-url-queue');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let rendererEntryService = null;
const shouldDebugContextMenus =
  !app.isPackaged && process.env.HAVEN_DEBUG_CONTEXT_MENUS === '1';
const shouldDebugWindowFocus = process.env.HAVEN_DEBUG_WINDOW_FOCUS === '1';
const shouldDebugRendererEntry = process.env.HAVEN_DEBUG_RENDERER_ENTRY === '1';
const rendererEntryPortFromEnv = Number.parseInt(process.env.HAVEN_RENDERER_HTTP_PORT ?? '', 10);
const devRendererEntryPortOverride =
  !app.isPackaged &&
  Number.isInteger(rendererEntryPortFromEnv) &&
  rendererEntryPortFromEnv >= 1 &&
  rendererEntryPortFromEnv <= 65535
    ? rendererEntryPortFromEnv
    : undefined;

const debugContextMenu = (scope, eventName, details) => {
  if (!shouldDebugContextMenus) return;
  console.debug(`[context-menu:${scope}] ${eventName}`, details ?? {});
};

const debugWindowFocus = (eventName, details) => {
  if (!shouldDebugWindowFocus) return;
  console.debug(`[window-focus] ${eventName}`, details ?? {});
};

const protocolUrlQueue = createProtocolUrlQueue({
  getMainWindow: () => mainWindow,
});
const { pendingProtocolUrls } = protocolUrlQueue;
protocolUrlQueue.registerAppProtocolHandlers({
  app,
  hasSingleInstanceLock,
  initialArgs: process.argv,
});

const settingsStore = createSettingsStore(app);
const updaterService = createUpdaterService({
  app,
  autoUpdater,
  settingsStore,
  repository: 'redrix-dev/haven',
});

const createWindow = () => {
  const window = createMainWindow({
    app,
    preloadEntry: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    rendererEntryService,
    shouldDebugWindowFocus,
    debugWindowFocus,
    debugContextMenu,
    onClosed: (closedWindow) => {
      if (mainWindow === closedWindow) {
        mainWindow = null;
      }
    },
  });
  mainWindow = window;

  return window;
};

registerWindowBehaviors({
  app,
  BrowserWindow,
  createWindow,
  getRendererEntryService: () => rendererEntryService,
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  try {
    rendererEntryService = await startMainRuntime({
      app,
      sessionRef: session.defaultSession,
      ipcMain,
      settingsStore,
      updaterService,
      getMainWindow: () => mainWindow,
      pendingProtocolUrls,
      shouldDebugRendererEntry,
      devRendererEntryPortOverride,
      mainWindowWebpackEntry: MAIN_WINDOW_WEBPACK_ENTRY,
    });
    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isPortConflict = Boolean(error && typeof error === 'object' && error.code === 'EADDRINUSE');
    const errorBody = isPortConflict
      ? `Haven could not bind the unified renderer entry server because the required local port is already in use.\n\n${message}\n\nClose the conflicting process and try again.`
      : `Haven could not start the unified renderer entry service.\n\n${message}\n\nCheck for a loopback port conflict and try again.`;
    console.error('Failed to initialize Haven main process:', error);
    dialog.showErrorBox('Haven failed to start', errorBody);
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
