const { DESKTOP_IPC_KEYS } = require('@platform/ipc/keys');

const exposeDesktopBridge = ({ contextBridge, ipcRenderer }) => {
  contextBridge.exposeInMainWorld('desktop', {
    getAppSettings: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_GET),
    setAutoUpdateEnabled: (enabled) =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_SET_AUTO_UPDATE, { enabled }),
    setNotificationAudioSettings: (payload) =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_SET_NOTIFICATION_AUDIO, payload),
    setVoiceSettings: (payload) =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.SETTINGS_SET_VOICE, payload),
    getUpdaterStatus: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_STATUS_GET),
    checkForUpdates: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.UPDATER_CHECK_NOW),
    saveFileFromUrl: (payload) => ipcRenderer.invoke(DESKTOP_IPC_KEYS.MEDIA_SAVE_FROM_URL, payload),
    openExternalUrl: (url) => ipcRenderer.invoke(DESKTOP_IPC_KEYS.EXTERNAL_URL_OPEN, url),
    consumeNextProtocolUrl: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.PROTOCOL_URL_CONSUME_NEXT),
    minimizeWindow: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.WINDOW_MINIMIZE),
    maximizeWindow: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.WINDOW_MAXIMIZE_TOGGLE),
    closeWindow: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.WINDOW_CLOSE),

    openVoicePopout: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.VOICE_POPOUT_OPEN),
    closeVoicePopout: () => ipcRenderer.invoke(DESKTOP_IPC_KEYS.VOICE_POPOUT_CLOSE),
    syncVoicePopoutState: (payload) =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.VOICE_POPOUT_STATE_SYNC, payload),
    requestVoicePopoutStateSync: () =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.VOICE_POPOUT_REQUEST_SYNC),
    dispatchVoicePopoutControlAction: (payload) =>
      ipcRenderer.invoke(DESKTOP_IPC_KEYS.VOICE_POPOUT_CONTROL_DISPATCH, payload),

    onVoicePopoutState: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }

      const wrappedListener = (_event, state) => {
        listener(state);
      };

      ipcRenderer.on(DESKTOP_IPC_KEYS.VOICE_POPOUT_STATE_EVENT, wrappedListener);
      return () => {
        ipcRenderer.removeListener(DESKTOP_IPC_KEYS.VOICE_POPOUT_STATE_EVENT, wrappedListener);
      };
    },
    onVoicePopoutControlAction: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }

      const wrappedListener = (_event, action) => {
        listener(action);
      };

      ipcRenderer.on(DESKTOP_IPC_KEYS.VOICE_POPOUT_CONTROL_EVENT, wrappedListener);
      return () => {
        ipcRenderer.removeListener(DESKTOP_IPC_KEYS.VOICE_POPOUT_CONTROL_EVENT, wrappedListener);
      };
    },
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
};

module.exports = {
  exposeDesktopBridge,
};
