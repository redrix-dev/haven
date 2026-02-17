# Auto Updates (GitHub Releases)

## What Is Implemented
- Main-process updater service using `update-electron-app`.
- Source configured for `redrix-dev/haven` on GitHub Releases.
- Local persistent app settings file with schema versioning:
  - `autoUpdateEnabled` (default `true`)
- Renderer account settings UI:
  - Auto-update toggle
  - Confirmation prompt when disabling
  - Manual "Check now" action
  - Current updater status + last error

## Important Behavior
- Auto updates are only active for packaged builds (`app.isPackaged`).
- Linux is treated as unsupported for built-in Electron auto updates.
- If updates are turned off after updater startup, a restart may be required to fully stop active checks.

## Publish Setup
1. Ensure GitHub repository exists: `redrix-dev/haven`.
2. Set `GITHUB_TOKEN` in your CI or shell before publish.
3. Run:
   - `npm run make`
   - `npm run publish`

Forge publisher config lives in `forge.config.js`.

## Local Settings Storage
- File: `{app.getPath('userData')}/app-settings.json`
- Current schema:
  - `schemaVersion: 1`
  - `autoUpdateEnabled: boolean`

This store is local-device scoped and survives normal app updates.

