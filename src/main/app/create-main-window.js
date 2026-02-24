const { BrowserWindow } = require('electron');
const { registerNativeContextMenu } = require('./register-native-context-menu');

const createMainWindow = ({
  app,
  preloadEntry,
  rendererEntryService,
  shouldDebugWindowFocus,
  debugWindowFocus,
  debugContextMenu,
  onClosed,
}) => {
  if (!rendererEntryService) {
    throw new Error('Renderer entry service must be started before creating the main window.');
  }

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadEntry,
    },
  });

  if (shouldDebugWindowFocus) {
    window.on('focus', () => {
      debugWindowFocus('focus', { minimized: window.isMinimized(), visible: window.isVisible() });
    });
    window.on('blur', () => {
      debugWindowFocus('blur', { visible: window.isVisible() });
    });
    window.on('show', () => {
      debugWindowFocus('show');
    });
    window.on('hide', () => {
      debugWindowFocus('hide');
    });
    window.webContents.on('did-start-loading', () => {
      debugWindowFocus('did-start-loading', { url: window.webContents.getURL() });
    });
    window.webContents.on('did-finish-load', () => {
      debugWindowFocus('did-finish-load', { url: window.webContents.getURL() });
    });
  }

  // Load the app renderer through the unified loopback entry service.
  window.loadURL(rendererEntryService.getEntryUrl('main_window'));

  if (!app.isPackaged) {
    // Open the DevTools only in development.
    window.webContents.openDevTools();
  }

  registerNativeContextMenu({
    window,
    debugContextMenu,
  });

  window.on('closed', () => {
    onClosed?.(window);
  });

  return window;
};

module.exports = {
  createMainWindow,
};
