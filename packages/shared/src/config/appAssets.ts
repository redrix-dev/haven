import appAssetsManifest from './appAssets.json';

export const appAssets = appAssetsManifest;

export const DESKTOP_ICON_BASE_PATH = appAssets.desktop.iconBasePath;
export const BROWSER_TAB_ICON = appAssets.web.browserTabIcon;
export const HIGH_RESOLUTION_ICON = appAssets.web.highResolutionIcon;
export const APPLE_TOUCH_ICON = appAssets.web.appleTouchIcon;

export type AppAssetsManifest = typeof appAssets;
