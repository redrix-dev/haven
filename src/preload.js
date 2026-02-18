const { contextBridge, ipcRenderer } = require('electron');
const { DESKTOP_IPC_KEYS } = require('./shared/ipc/keys');

contextBridge.exposeInMainWorld('desktop', {
  getAppSettings: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_GET),
  setAutoUpdateEnabled: (enabled) =>
    ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_SET_AUTO_UPDATE, { enabled }),
  getUpdaterStatus: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_STATUS_GET),
  checkForUpdates: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_CHECK_NOW),
});
