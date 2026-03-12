const { contextBridge, ipcRenderer } = require('electron');
const { exposeDesktopBridge } = require('./desktop-bridge');

exposeDesktopBridge({
  contextBridge,
  ipcRenderer,
});
