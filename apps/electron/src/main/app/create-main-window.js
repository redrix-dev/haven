const { BrowserWindow } = require('electron');
const { registerNativeContextMenu } = require('./register-native-context-menu');

const createMainWindow = ({
  app,
  preloadEntry,
  rendererEntryUrl,
  shouldDebugWindowFocus,
  debugWindowFocus,
  debugContextMenu,
  onClosed,
  BrowserWindowClass = BrowserWindow,
  registerNativeContextMenuFn = registerNativeContextMenu,
}) => {
  if (!rendererEntryUrl) {
    throw new Error('Renderer entry URL must be provided before creating the main window.');
  }

  const window = new BrowserWindowClass({
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

  window.loadURL(rendererEntryUrl);

  if (!app.isPackaged) {
    // Open the DevTools only in development.
    window.webContents.openDevTools();
  }

  registerNativeContextMenuFn({
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
