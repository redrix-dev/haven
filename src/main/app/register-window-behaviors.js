const registerWindowBehaviors = ({ app, BrowserWindow, createWindow, getRendererEntryService }) => {
  app.on('activate', () => {
    if (!getRendererEntryService()) return;
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    const rendererEntryService = getRendererEntryService();
    if (!rendererEntryService) return;
    void rendererEntryService.stop().catch((error) => {
      console.error('Failed to stop renderer entry service:', error);
    });
  });
};

module.exports = {
  registerWindowBehaviors,
};
