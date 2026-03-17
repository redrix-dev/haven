# App Asset Replacement Guide

Haven uses a shared asset manifest so desktop packaging and web/mobile runtime icons stay in sync.

## Canonical Manifest Source

Update these values only if filenames or paths change:

- `packages/shared/src/config/appAssets.json`

After changing manifest values, regenerate derived files:

```bash
npm run assets:generate
```

## Files To Replace For Normal Icon Refreshes

For most updates, keep manifest paths the same and replace image files only:

- `apps/electron/assets/icon.png` -> Desktop app icon source for packaged Electron apps
- `apps/electron/assets/icon.ico` -> Windows installer icon
- `apps/web-mobile/public/icon-192.png` -> Browser tab icon, Apple touch icon, 192 PWA icon, mobile splash icon, and notification icon/badge fallback
- `apps/web-mobile/public/icon-512.png` -> Large PWA install icon

## Platform Impact By File

- `apps/electron/assets/icon.png`
  - Electron packaged app icon (`packagerConfig.icon` base path)
- `apps/electron/assets/icon.ico`
  - Electron Windows setup executable icon (`setupIcon`)
- `apps/web-mobile/public/icon-192.png`
  - Browser tab icon fallback
  - Apple touch icon for iOS home-screen installs
  - PWA manifest icon (192)
  - Mobile splash screen image
  - Service worker notification fallback `icon` and `badge`
- `apps/web-mobile/public/icon-512.png`
  - PWA manifest icon (512)

## Generated Files

These are generated from `appAssets.json` by `npm run assets:generate`:

- `apps/web-mobile/public/manifest.json`
- `apps/web-mobile/public/app-assets.generated.json`
- `apps/web-mobile/public/app-assets.generated.js`
- `apps/web-mobile/src/generated/appAssets.generated.ts`
- `apps/web-mobile/src/index.html`

Template source:

- `apps/web-mobile/src/index.template.html`

## Missing Asset Checks

- Electron packaging logs missing desktop icon files from `forge.config.js` startup.
- The asset generator now fails if configured web icon files are missing.
- Web dev startup logs missing manifest, favicon, Apple touch icon, splash, and notification assets from `apps/web-mobile/src/pwa/assertWebAppAssets.ts`.
