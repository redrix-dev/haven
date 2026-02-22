const { contextBridge, ipcRenderer } = require('electron');
const { DESKTOP_IPC_KEYS } = require('./shared/ipc/keys');

contextBridge.exposeInMainWorld('desktop', {
  getAppSettings: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_GET),
  setAutoUpdateEnabled: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_SET_AUTO_UPDATE, { enabled }),
  getUpdaterStatus: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_STATUS_GET),
  checkForUpdates: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_CHECK_NOW),
  saveFileFromUrl: (payload) => ipcRenderer.invoke(DESKTOP_IPC_KEYS.MEDIA_SAVE_FROM_URL, payload),
  consumeNextProtocolUrl: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.PROTOCOL_URL_CONSUME_NEXT),
  onProtocolUrl: (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }

    const wrappedListener = (_event, url) => {
      listener(url);
    };

    ipcRenderer.on(DESKTOP_IPC_KEYS.PROTOCOL_URL_EVENT, wrappedListener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC_KEYS.PROTOCOL_URL_EVENT, wrappedListener);
    };
  },
});
