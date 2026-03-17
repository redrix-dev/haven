const { BrowserWindow } = require('electron');

const { DESKTOP_IPC_KEYS } = require('@platform/ipc/keys');

const createVoicePopoutWindowManager = ({ app, preloadEntry, rendererEntryService, getMainWindow, onClosed }) => {
  let voicePopoutWindow = null;

  const isAlive = () => voicePopoutWindow && !voicePopoutWindow.isDestroyed();

  const getWindow = () => (isAlive() ? voicePopoutWindow : null);

  const open = () => {
    const existing = getWindow();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }

    const window = new BrowserWindow({
      width: 420,
      height: 640,
      minWidth: 360,
      minHeight: 500,
      title: 'Haven Voice Popout',
      frame: true,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadEntry,
      },
    });

    window.loadURL(`${rendererEntryService.getEntryUrl('voice_popout')}?view=voice-popout`);

    if (!app.isPackaged) {
      window.webContents.openDevTools({ mode: 'detach' });
    }

    window.on('closed', () => {
      voicePopoutWindow = null;
      onClosed?.();
    });

    voicePopoutWindow = window;
    return window;
  };

  const close = () => {
    const existing = getWindow();
    if (!existing) return false;
    existing.close();
    return true;
  };

  const sendState = (state) => {
    const existing = getWindow();
    if (!existing) return;
    existing.webContents.send(DESKTOP_IPC_KEYS.VOICE_POPOUT_STATE_EVENT, state);
  };

  const sendControlAction = (action) => {
    const mainWindow = getMainWindow?.() ?? null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(DESKTOP_IPC_KEYS.VOICE_POPOUT_CONTROL_EVENT, action);
  };

  return {
    open,
    close,
    getWindow,
    sendState,
    sendControlAction,
  };
};

module.exports = {
  createVoicePopoutWindowManager,
};
