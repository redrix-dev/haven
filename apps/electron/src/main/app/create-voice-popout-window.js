const createVoicePopoutWindowManager = ({
  app,
  preloadEntry,
  rendererEntryService,
  getMainWindow,
  onClosed = null,
  desktopIpcKeys = null,
  BrowserWindowClass = null,
}) => {
  const ipcKeys = desktopIpcKeys ?? require('@platform/ipc/keys').DESKTOP_IPC_KEYS;
  const WindowConstructor = BrowserWindowClass ?? require('electron').BrowserWindow;
  let voicePopoutWindow = null;
  let currentState = {
    isOpen: false,
    serverName: null,
    channelName: null,
    connected: false,
    joined: false,
    joining: false,
    isMuted: false,
    isDeafened: false,
    transmissionMode: 'voice_activity',
    participantCount: 0,
    selectedInputDeviceId: 'default',
    selectedOutputDeviceId: 'default',
    inputDevices: [],
    outputDevices: [],
    supportsOutputSelection: false,
    members: [],
  };

  const isAlive = () => voicePopoutWindow && !voicePopoutWindow.isDestroyed();

  const getWindow = () => (isAlive() ? voicePopoutWindow : null);
  const getCombinedState = () => ({
    ...currentState,
    isOpen: Boolean(getWindow()),
  });
  const broadcastState = () => {
    const nextState = getCombinedState();
    currentState = nextState;

    const mainWindow = getMainWindow?.() ?? null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcKeys.VOICE_POPOUT_STATE_EVENT, nextState);
    }

    const existing = getWindow();
    if (existing) {
      existing.webContents.send(ipcKeys.VOICE_POPOUT_STATE_EVENT, nextState);
    }
  };

  const open = () => {
    const existing = getWindow();
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      broadcastState();
      return existing;
    }

    const window = new WindowConstructor({
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

    window.webContents.once('did-finish-load', () => {
      broadcastState();
    });
    window.loadURL(`${rendererEntryService.getEntryUrl('voice_popout')}?view=voice-popout`);

    if (!app.isPackaged) {
      window.webContents.openDevTools({ mode: 'detach' });
    }

    window.on('closed', () => {
      voicePopoutWindow = null;
      broadcastState();
      onClosed?.();
    });

    voicePopoutWindow = window;
    broadcastState();
    return window;
  };

  const close = () => {
    const existing = getWindow();
    if (!existing) return false;
    existing.close();
    return true;
  };

  const sendState = (state) => {
    currentState = {
      ...state,
      isOpen: Boolean(getWindow()),
    };
    broadcastState();
  };

  const sendControlAction = (action) => {
    const mainWindow = getMainWindow?.() ?? null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(ipcKeys.VOICE_POPOUT_CONTROL_EVENT, action);
  };

  return {
    open,
    close,
    getWindow,
    getState: () => getCombinedState(),
    sendState,
    sendControlAction,
  };
};

module.exports = {
  createVoicePopoutWindowManager,
};
