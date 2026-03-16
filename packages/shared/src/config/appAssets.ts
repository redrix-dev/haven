import appAssetsManifest from './appAssets.json';

export const appAssets = appAssetsManifest;

export const DESKTOP_ICON_BASE_PATH = appAssets.desktop.iconBasePath;
export const PWA_ICON_192 = appAssets.web.pwaIcons.size192;
export const PWA_ICON_512 = appAssets.web.pwaIcons.size512;
export const SPLASH_ICON = appAssets.web.splashIcon;
export const NOTIFICATION_ICON_FALLBACK = appAssets.web.notification.iconFallback;
export const NOTIFICATION_BADGE_FALLBACK = appAssets.web.notification.badgeFallback;

export type AppAssetsManifest = typeof appAssets;
