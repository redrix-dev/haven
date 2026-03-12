const registerPermissionHandlers = ({ sessionRef }) => {
  // Allow microphone access for WebRTC voice channels and clipboard flows used by the renderer.
  sessionRef.setPermissionCheckHandler((_webContents, permission) => {
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

  sessionRef.setPermissionRequestHandler((_webContents, permission, callback) => {
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
};

module.exports = {
  registerPermissionHandlers,
};
