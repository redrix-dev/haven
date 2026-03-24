const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow, dialog, shell } = require('electron');
const { DESKTOP_IPC_KEYS } = require('@platform/ipc/keys');
const {
  parseSaveFileFromUrlPayload,
  parseOpenExternalUrlPayload,
  parseSetAutoUpdatePayload,
  parseSetNotificationAudioPayload,
  parseSetVoiceSettingsPayload,
  parseVoicePopoutStatePayload,
  parseVoicePopoutControlActionPayload,
} = require('@platform/ipc/validators');

const registerIpcHandler = (ipcMain, channel, handler) => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
};

const registerDesktopIpcHandlers = ({
  ipcMain,
  settingsStore,
  updaterService,
  getMainWindow,
  pendingProtocolUrls,
  voicePopoutWindowManager,
}) => {
  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.SETTINGS_GET, async () => settingsStore.getSettings());

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.SETTINGS_SET_AUTO_UPDATE, async (_event, payload) => {
    const { enabled } = parseSetAutoUpdatePayload(payload);
    const settings = settingsStore.updateSettings({
      autoUpdateEnabled: Boolean(enabled),
    });
    const updaterStatus = updaterService.syncWithSettings();

    return {
      settings,
      updaterStatus,
    };
  });

  registerIpcHandler(
    ipcMain,
    DESKTOP_IPC_KEYS.SETTINGS_SET_NOTIFICATION_AUDIO,
    async (_event, payload) => {
      const nextNotificationAudioSettings = parseSetNotificationAudioPayload(payload);
      const settings = settingsStore.updateSettings({
        notifications: nextNotificationAudioSettings,
      });

      return {
        settings,
      };
    }
  );

  registerIpcHandler(
    ipcMain,
    DESKTOP_IPC_KEYS.SETTINGS_SET_VOICE,
    async (_event, payload) => {
      const nextVoiceSettings = parseSetVoiceSettingsPayload(payload);
      const settings = settingsStore.updateSettings({
        voice: nextVoiceSettings,
      });

      return {
        settings,
      };
    }
  );

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.UPDATER_STATUS_GET, async () => updaterService.getStatus());

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.UPDATER_CHECK_NOW, async () =>
    updaterService.checkForUpdatesNow()
  );

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.MEDIA_SAVE_FROM_URL, async (event, payload) => {
    const { url, suggestedName } = parseSaveFileFromUrlPayload(payload);
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow() ?? undefined;
    const defaultPath =
      suggestedName && suggestedName.length > 0 ? path.basename(suggestedName) : undefined;

    const { canceled, filePath } = await dialog.showSaveDialog(targetWindow, {
      title: 'Save Media',
      defaultPath,
      properties: ['showOverwriteConfirmation'],
    });

    if (canceled || !filePath) {
      return {
        saved: false,
        filePath: null,
      };
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download media (${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    return {
      saved: true,
      filePath,
    };
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.EXTERNAL_URL_OPEN, async (_event, payload) => {
    const url = parseOpenExternalUrlPayload(payload);
    await shell.openExternal(url);
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.PROTOCOL_URL_CONSUME_NEXT, async () =>
    pendingProtocolUrls.shift() ?? null
  );

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.WINDOW_MINIMIZE, async () => {
    getMainWindow()?.minimize();
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.WINDOW_MAXIMIZE_TOGGLE, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return;
    }

    mainWindow.maximize();
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.WINDOW_CLOSE, async () => {
    getMainWindow()?.close();
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.VOICE_POPOUT_OPEN, async () => {
    voicePopoutWindowManager?.open();
    return { opened: true };
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.VOICE_POPOUT_CLOSE, async () => {
    const closed = voicePopoutWindowManager?.close() ?? false;
    return { closed };
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.VOICE_POPOUT_STATE_SYNC, async (_event, payload) => {
    const nextState = parseVoicePopoutStatePayload(payload);
    voicePopoutWindowManager?.sendState(nextState);
  });

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.VOICE_POPOUT_REQUEST_SYNC, async () => {
    if (!voicePopoutWindowManager?.getState) return;
    voicePopoutWindowManager.sendState(voicePopoutWindowManager.getState());
  });

  registerIpcHandler(
    ipcMain,
    DESKTOP_IPC_KEYS.VOICE_POPOUT_CONTROL_DISPATCH,
    async (_event, payload) => {
      const action = parseVoicePopoutControlActionPayload(payload);
      voicePopoutWindowManager?.sendControlAction(action);
    }
  );

  // CHECKPOINT 2 COMPLETE
};

module.exports = {
  registerDesktopIpcHandlers,
};
