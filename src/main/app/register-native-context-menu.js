const { Menu } = require('electron');

const registerNativeContextMenu = ({ window, debugContextMenu }) => {
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
};

module.exports = {
  registerNativeContextMenu,
};
