const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('havenDesktop', {
  getAppSettings: () => ipcRenderer.invoke('haven:settings:get'),
  setAutoUpdateEnabled: (enabled) =>
    ipcRenderer.invoke('haven:settings:set-auto-update', { enabled }),
  getUpdaterStatus: () => ipcRenderer.invoke('haven:updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('haven:updater:check'),
});

