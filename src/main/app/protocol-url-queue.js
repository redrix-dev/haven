const { DESKTOP_IPC_KEYS } = require('../../shared/ipc/keys');

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

const createProtocolUrlQueue = ({ getMainWindow }) => {
  const pendingProtocolUrls = [];

  const focusMainWindow = () => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  };

  const enqueueProtocolUrl = (url) => {
    if (!isHavenProtocolUrl(url)) return;

    const mainWindow = getMainWindow();
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

  const registerAppProtocolHandlers = ({ app, hasSingleInstanceLock, initialArgs }) => {
    if (hasSingleInstanceLock) {
      handleProtocolArgs(initialArgs);
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
  };

  return {
    pendingProtocolUrls,
    focusMainWindow,
    enqueueProtocolUrl,
    handleProtocolArgs,
    registerAppProtocolHandlers,
  };
};

module.exports = {
  createProtocolUrlQueue,
};
