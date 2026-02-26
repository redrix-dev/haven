const fs = require('node:fs/promises');
const path = require('node:path');
const { BrowserWindow, dialog } = require('electron');
const { DESKTOP_IPC_KEYS } = require('../../shared/ipc/keys');
const {
  parseSaveFileFromUrlPayload,
  parseSetAutoUpdatePayload,
  parseSetNotificationAudioPayload,
  parseSetVoiceSettingsPayload,
} = require('../../shared/ipc/validators');

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

  registerIpcHandler(ipcMain, DESKTOP_IPC_KEYS.PROTOCOL_URL_CONSUME_NEXT, async () =>
    pendingProtocolUrls.shift() ?? null
  );
};

module.exports = {
  registerDesktopIpcHandlers,
};
