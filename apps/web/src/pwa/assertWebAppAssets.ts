import { webAppAssets } from '@web/generated/appAssets.generated';

const toAbsoluteAssetUrl = (assetPath: string): string => new URL(assetPath, window.location.origin).toString();

const checkAsset = async (label: string, assetPath: string): Promise<void> => {
  const response = await fetch(toAbsoluteAssetUrl(assetPath), { method: 'HEAD', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${label} (${assetPath}) returned ${response.status}`);
  }
};

export const assertWebAppAssetsInDev = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'development') return;

  const checks: Array<[string, string]> = [
    ['Manifest', webAppAssets.manifestUrl],
    ['PWA icon 192', webAppAssets.pwaIcon192],
    ['PWA icon 512', webAppAssets.pwaIcon512],
    ['Browser tab icon', webAppAssets.browserTabIcon],
    ['Apple touch icon', webAppAssets.appleTouchIcon],
    ['Splash icon', webAppAssets.splashIcon],
    ['Notification icon fallback', webAppAssets.notificationIconFallback],
    ['Notification badge fallback', webAppAssets.notificationBadgeFallback],
  ];

  const failures: string[] = [];

  await Promise.all(
    checks.map(async ([label, assetPath]) => {
      try {
        await checkAsset(label, assetPath);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`- ${label}: ${reason}`);
      }
    })
  );

  if (failures.length > 0) {
    console.warn(`[app-assets] Missing web runtime assets:\n${failures.join('\n')}`);
  }
};
