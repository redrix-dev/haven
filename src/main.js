const { app, BrowserWindow, Menu, dialog, session, ipcMain, autoUpdater } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSettingsStore } = require('./main/settings-store');
const { createUpdaterService } = require('./main/updater-service');
const { createRendererEntryService } = require('./main/renderer-entry-service');
const { buildRendererCsp } = require('./main/renderer-entry-csp');
const { DESKTOP_IPC_KEYS } = require('./shared/ipc/keys');
const {
  parseSaveFileFromUrlPayload,
  parseSetAutoUpdatePayload,
  parseSetNotificationAudioPayload,
} = require('./shared/ipc/validators');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let rendererEntryService = null;
const pendingProtocolUrls = [];
const shouldDebugContextMenus =
  !app.isPackaged && process.env.HAVEN_DEBUG_CONTEXT_MENUS === '1';
const shouldDebugWindowFocus = process.env.HAVEN_DEBUG_WINDOW_FOCUS === '1';
const shouldDebugRendererEntry = process.env.HAVEN_DEBUG_RENDERER_ENTRY === '1';
const rendererEntryPortFromEnv = Number.parseInt(process.env.HAVEN_RENDERER_HTTP_PORT ?? '', 10);
const devRendererEntryPortOverride =
  !app.isPackaged &&
  Number.isInteger(rendererEntryPortFromEnv) &&
  rendererEntryPortFromEnv >= 1 &&
  rendererEntryPortFromEnv <= 65535
    ? rendererEntryPortFromEnv
    : undefined;

const debugContextMenu = (scope, eventName, details) => {
  if (!shouldDebugContextMenus) return;
  console.debug(`[context-menu:${scope}] ${eventName}`, details ?? {});
};

const debugWindowFocus = (eventName, details) => {
  if (!shouldDebugWindowFocus) return;
  console.debug(`[window-focus] ${eventName}`, details ?? {});
};

const isHavenProtocolUrl = (value) =>
  typeof value === 'string' && value.toLowerCase().startsWith('haven://');

const extractHavenProtocolUrl = (args) => {
  if (!Array.isArray(args)) return null;
  for (const arg of args) {
    if (isHavenProtocolUrl(arg)) {
      return arg;
    }
  }
  return null;
};

const focusMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
};

const enqueueProtocolUrl = (url) => {
  if (!isHavenProtocolUrl(url)) return;
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isLoadingMainFrame()
  ) {
    mainWindow.webContents.send(DESKTOP_IPC_KEYS.PROTOCOL_URL_EVENT, url);
    return;
  }

  pendingProtocolUrls.push(url);
};

const handleProtocolArgs = (args) => {
  const protocolUrl = extractHavenProtocolUrl(args);
  if (!protocolUrl) return;
  enqueueProtocolUrl(protocolUrl);
};

if (hasSingleInstanceLock) {
  handleProtocolArgs(process.argv);
}

app.on('second-instance', (_event, commandLine) => {
  if (!hasSingleInstanceLock) return;
  handleProtocolArgs(commandLine);
  focusMainWindow();
});

app.on('open-url', (event, url) => {
  if (!hasSingleInstanceLock) return;
  event.preventDefault();
  enqueueProtocolUrl(url);
  focusMainWindow();
});

const settingsStore = createSettingsStore(app);
const updaterService = createUpdaterService({
  app,
  autoUpdater,
  settingsStore,
  repository: 'redrix-dev/haven',
});

const registerIpcHandler = (channel, handler) => {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
};

const registerIpcHandlers = () => {
  registerIpcHandler(DESKTOP_IPC_KEYS.SETTINGS_GET, async () => settingsStore.getSettings());

  registerIpcHandler(DESKTOP_IPC_KEYS.SETTINGS_SET_AUTO_UPDATE, async (_event, payload) => {
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

  registerIpcHandler(DESKTOP_IPC_KEYS.SETTINGS_SET_NOTIFICATION_AUDIO, async (_event, payload) => {
    const nextNotificationAudioSettings = parseSetNotificationAudioPayload(payload);
    const settings = settingsStore.updateSettings({
      notifications: nextNotificationAudioSettings,
    });

    return {
      settings,
    };
  });

  registerIpcHandler(DESKTOP_IPC_KEYS.UPDATER_STATUS_GET, async () => updaterService.getStatus());

  registerIpcHandler(DESKTOP_IPC_KEYS.UPDATER_CHECK_NOW, async () =>
    updaterService.checkForUpdatesNow()
  );

  registerIpcHandler(DESKTOP_IPC_KEYS.MEDIA_SAVE_FROM_URL, async (event, payload) => {
    const { url, suggestedName } = parseSaveFileFromUrlPayload(payload);
    const targetWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
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

  registerIpcHandler(DESKTOP_IPC_KEYS.PROTOCOL_URL_CONSUME_NEXT, async () =>
    pendingProtocolUrls.shift() ?? null
  );
};

const registerRendererDocumentHeaderPolicy = ({ sessionRef, rendererEntryServiceRef }) => {
  sessionRef.webRequest.onHeadersReceived((details, callback) => {
    const url = typeof details.url === 'string' ? details.url : '';
    const isRendererDocument =
      details.resourceType === 'mainFrame' && rendererEntryServiceRef.isRendererDocumentUrl(url);

    if (!isRendererDocument) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          buildRendererCsp({
            rendererOrigin: rendererEntryServiceRef.getCanonicalOrigin(),
          }),
        ],
        'Referrer-Policy': ['origin'],
      },
    });
  });
};

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  mainWindow = window;

  if (!rendererEntryService) {
    throw new Error('Renderer entry service must be started before creating the main window.');
  }

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

  // and load the app renderer through the unified loopback entry service.
  window.loadURL(rendererEntryService.getEntryUrl('main_window'));

  if (!app.isPackaged) {
    // Open the DevTools only in development.
    window.webContents.openDevTools();
  }

  window.webContents.on('context-menu', (_event, params) => {
    const hasSelectedText =
      typeof params.selectionText === 'string' && params.selectionText.trim().length > 0;

    debugContextMenu('text-native', 'event', {
      isEditable: params.isEditable,
      hasSelectedText,
      mediaType: params.mediaType,
    });

    if (!params.isEditable && !hasSelectedText) return;

    const template = params.isEditable
      ? [
          { role: 'cut', enabled: Boolean(params.editFlags?.canCut) },
          { role: 'copy', enabled: Boolean(params.editFlags?.canCopy) },
          { role: 'paste', enabled: Boolean(params.editFlags?.canPaste) },
          { type: 'separator' },
          { role: 'selectAll' },
        ]
      : [
          { role: 'copy', enabled: hasSelectedText },
          { role: 'selectAll' },
        ];

    debugContextMenu('text-native', 'menu-open', {
      isEditable: params.isEditable,
      hasSelectedText,
      itemCount: template.length,
    });

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window });
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  try {
    app.setAsDefaultProtocolClient('haven');
    settingsStore.initialize();
    updaterService.initialize();
    registerIpcHandlers();

    rendererEntryService = createRendererEntryService({
      entries: [
        {
          entryName: 'main_window',
          webpackEntryUrl: MAIN_WINDOW_WEBPACK_ENTRY,
        },
      ],
      ...(devRendererEntryPortOverride ? { port: devRendererEntryPortOverride } : {}),
      debug: shouldDebugRendererEntry,
    });
    await rendererEntryService.start();

    registerRendererDocumentHeaderPolicy({
      sessionRef: session.defaultSession,
      rendererEntryServiceRef: rendererEntryService,
    });

    // Allow microphone access for WebRTC voice channels.
    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
      if (
        permission === 'media' ||
        permission === 'microphone' ||
        permission === 'clipboard-read' ||
        permission === 'clipboard-sanitized-write'
      ) {
        return true;
      }

      return false;
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (
        permission === 'media' ||
        permission === 'microphone' ||
        permission === 'clipboard-read' ||
        permission === 'clipboard-sanitized-write'
      ) {
        callback(true);
        return;
      }

      callback(false);
    });

    createWindow();

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isPortConflict = Boolean(error && typeof error === 'object' && error.code === 'EADDRINUSE');
    const errorBody = isPortConflict
      ? `Haven could not bind the unified renderer entry server because the required local port is already in use.\n\n${message}\n\nClose the conflicting process and try again.`
      : `Haven could not start the unified renderer entry service.\n\n${message}\n\nCheck for a loopback port conflict and try again.`;
    console.error('Failed to initialize Haven main process:', error);
    dialog.showErrorBox('Haven failed to start', errorBody);
    app.quit();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (!rendererEntryService) return;
  void rendererEntryService.stop().catch((error) => {
    console.error('Failed to stop renderer entry service:', error);
  });
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
