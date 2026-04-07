const { app, BrowserWindow, dialog, session, ipcMain, autoUpdater } = require('electron');
const { createSettingsStore } = require('./settings-store');
const { createUpdaterService } = require('./updater-service');
const { createMainWindow } = require('./app/create-main-window');
const { registerWindowBehaviors } = require('./app/register-window-behaviors');
const { startMainRuntime } = require('./app/start-main-runtime');
const { createVoicePopoutWindowManager } = require('./app/create-voice-popout-window');
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
let voicePopoutWindowManager = null;
const shouldDebugContextMenus =
  !app.isPackaged && process.env.HAVEN_DEBUG_CONTEXT_MENUS === '1';
const shouldDebugWindowFocus = process.env.HAVEN_DEBUG_WINDOW_FOCUS === '1';

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
    rendererEntryUrl: MAIN_WINDOW_WEBPACK_ENTRY,
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
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  try {
    await startMainRuntime({
      app,
      sessionRef: session.defaultSession,
      ipcMain,
      settingsStore,
      updaterService,
      getMainWindow: () => mainWindow,
      pendingProtocolUrls,
      voicePopoutWindowManager: {
        open: () => voicePopoutWindowManager?.open(),
        close: () => voicePopoutWindowManager?.close(),
        getState: () => voicePopoutWindowManager?.getState(),
        sendState: (state) => voicePopoutWindowManager?.sendState(state),
        sendControlAction: (action) => voicePopoutWindowManager?.sendControlAction(action),
      },
      mainWindowWebpackEntry: MAIN_WINDOW_WEBPACK_ENTRY,
    });
    voicePopoutWindowManager = createVoicePopoutWindowManager({
      app,
      preloadEntry: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      rendererEntryUrl: MAIN_WINDOW_WEBPACK_ENTRY,
      getMainWindow: () => mainWindow,
    });
    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to initialize Haven main process:', error);
    dialog.showErrorBox(
      'Haven failed to start',
      `Haven could not initialize the main process.\n\n${message}`,
    );
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
