const { app, BrowserWindow, session, ipcMain, autoUpdater } = require('electron');
const { createSettingsStore } = require('./main/settings-store');
const { createUpdaterService } = require('./main/updater-service');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const settingsStore = createSettingsStore(app);
const updaterService = createUpdaterService({
  app,
  autoUpdater,
  settingsStore,
  repository: 'redrix-dev/haven',
});

const registerIpcHandler = (channel, handler) => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
};

const registerIpcHandlers = () => {
  registerIpcHandler('haven:settings:get', async () => settingsStore.getSettings());

  registerIpcHandler('haven:settings:set-auto-update', async (_event, payload) => {
    const enabled = Boolean(payload?.enabled);
    const settings = settingsStore.updateSettings({
      autoUpdateEnabled: enabled,
    });
    const updaterStatus = updaterService.syncWithSettings();

    return {
      settings,
      updaterStatus,
    };
  });

  registerIpcHandler('haven:updater:status', async () => updaterService.getStatus());

  registerIpcHandler('haven:updater:check', async () => updaterService.checkForUpdatesNow());
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // Set CSP for renderer + Supabase + local dev server websocket.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' http://localhost:9000 ws://localhost:9000 https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in stun: turn:; " +
          "media-src 'self' blob: mediastream:; " +
          "img-src 'self' data: https: blob:; " +
          "font-src 'self' data:; " +
          "object-src 'none'; " +
          "base-uri 'self'; " +
          "frame-ancestors 'none';"
        ]
      }
    });
  });
  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    // Open the DevTools only in development.
    mainWindow.webContents.openDevTools();
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  settingsStore.initialize();
  updaterService.initialize();
  registerIpcHandlers();

  // Allow microphone access for WebRTC voice channels.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (
      permission === 'media' ||
      permission === 'microphone' ||
      permission === 'clipboard-read' ||
      permission === 'clipboard-sanitized-write'
    ) {
      return true;
    }

    return false;
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'microphone' ||
      permission === 'clipboard-read' ||
      permission === 'clipboard-sanitized-write'
    ) {
      callback(true);
      return;
    }

    callback(false);
  });

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
