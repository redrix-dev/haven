const registerWindowBehaviors = ({ app, BrowserWindow, createWindow }) => {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
};

module.exports = {
  registerWindowBehaviors,
};
