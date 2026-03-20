# App Asset Replacement Guide

Haven uses a shared asset manifest so Electron packaging and the browser web entry stay in sync.

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
- `apps/web/public/icon-192.png` -> Browser tab icon and Apple touch icon
- `apps/web/public/icon-512.png` -> High-resolution browser icon

## Platform Impact By File

- `apps/electron/assets/icon.png`
  - Electron packaged app icon (`packagerConfig.icon` base path)
- `apps/electron/assets/icon.ico`
  - Electron Windows setup executable icon (`setupIcon`)
- `apps/web/public/icon-192.png`
  - Browser tab icon fallback
  - Apple touch icon
- `apps/web/public/icon-512.png`
  - High-resolution browser icon

## Generated Files

These are generated from `appAssets.json` by `npm run assets:generate`:

- `apps/web/src/index.html`

Template source:

- `apps/web/src/index.template.html`

## Missing Asset Checks

- Electron packaging logs missing desktop icon files from `forge.config.js` startup.
- The asset generator fails if configured browser icon files are missing.
