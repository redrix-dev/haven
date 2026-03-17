# App asset replacement guide

Haven now uses a shared asset manifest so desktop packaging and web/mobile runtime icons stay in sync.

## Canonical manifest source

Update these values only if filenames/paths change:

- `packages/shared/src/config/appAssets.json`

After changing the manifest values, regenerate derived files:

```bash
npm run assets:generate
```

## Files to replace for normal icon refreshes

For most updates, keep manifest paths the same and replace image files only:

- `apps/electron/assets/icon.png` → Desktop app icon source (`electron-forge` packager, macOS/Linux app icons)
- `apps/electron/assets/icon.ico` → Windows installer icon (`maker-squirrel setupIcon`)
- `apps/web-mobile/public/icon-192.png` → PWA icon, splash icon, and notification icon/badge fallback on web/mobile
- `apps/web-mobile/public/icon-512.png` → Large PWA icon (install surfaces)

## Platform impact by file

- `apps/electron/assets/icon.png`
  - Electron packaged app icon (`packagerConfig.icon` base path)
- `apps/electron/assets/icon.ico`
  - Electron Windows setup executable icon (`setupIcon`)
- `apps/web-mobile/public/icon-192.png`
  - PWA manifest icon (192)
  - Mobile splash screen image
  - Service worker notification fallback `icon` and `badge`
- `apps/web-mobile/public/icon-512.png`
  - PWA manifest icon (512)

## Generated files (do not hand edit)

These are generated from `appAssets.json` by `npm run assets:generate`:

- `apps/web-mobile/public/manifest.json`
- `apps/web-mobile/public/app-assets.generated.json`
- `apps/web-mobile/public/app-assets.generated.js`
- `apps/web-mobile/src/generated/appAssets.generated.ts`

## Missing asset checks in dev/startup

- Electron packaging logs missing desktop icon files from `forge.config.js` startup.
- Web dev startup logs missing PWA/splash/notification assets from `apps/web-mobile/src/pwa/assertWebAppAssets.ts`.
