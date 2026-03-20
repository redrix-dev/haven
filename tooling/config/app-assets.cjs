const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '..', '..');
const appAssets = require('../../packages/shared/src/config/appAssets.json');

const resolveRepoPath = (relativePath) => path.resolve(repoRoot, relativePath);

const desktopAssetPaths = {
  iconBasePath: resolveRepoPath(appAssets.desktop.iconBasePath),
  iconIcoPath: resolveRepoPath(appAssets.desktop.iconIcoPath),
  iconPngPath: resolveRepoPath(appAssets.desktop.iconPngPath),
};

const verifyDesktopAssetsExist = () => {
  const checks = [
    ['desktop icon base PNG', `${desktopAssetPaths.iconBasePath}.png`],
    ['desktop icon ICO', desktopAssetPaths.iconIcoPath],
  ];

  const missing = checks.filter(([, filePath]) => !fs.existsSync(filePath));

  if (missing.length > 0) {
    const details = missing.map(([name, filePath]) => `- ${name}: ${filePath}`).join('\n');
    console.warn(`[app-assets] Missing desktop app asset files:\n${details}`);
  }
};

module.exports = {
  appAssets,
  desktopAssetPaths,
  verifyDesktopAssetsExist,
};
