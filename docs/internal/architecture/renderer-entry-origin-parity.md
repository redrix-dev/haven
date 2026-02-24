# Renderer Entry Origin Parity

## Purpose
Define and document the renderer entry loading architecture that keeps Electron development and packaged builds on the same HTTP origin model so embedded providers (notably YouTube) behave consistently.

## Current Design
Haven uses a main-process `RendererEntryService` (`src/main/renderer-entry-service.js`) that exposes a single loopback HTTP origin for renderer entrypoints:
- Canonical origin: `http://127.0.0.1:43117`
- Entry path (current): `/main_window/`

Modes:
- Dev (`MAIN_WINDOW_WEBPACK_ENTRY` is `http://...`): local loopback server proxies HTTP + websocket traffic to Forge's webpack dev server.
- Packaged (`MAIN_WINDOW_WEBPACK_ENTRY` is `file://...`): local loopback server statically serves packaged renderer files from the resolved `.webpack` output directory.

`src/main/index.js` does not load Forge entry constants directly anymore. It loads through:
- `rendererEntryService.getEntryUrl('main_window')`

This preserves a consistent renderer origin in both dev and packaged builds.

## Why Parity Matters
Before this refactor:
- dev renderer origin was `http://localhost:...`
- packaged renderer origin was `file://...`

Embedded video providers can treat these differently. YouTube embeds are especially sensitive to referrer/client identity and can fail in packaged Electron with error `153` when loaded from `file://`.

By serving both modes from loopback HTTP, the embedded iframe environment is materially closer between dev and packaged builds.

## Trust Boundary
The renderer entry service is a **local transport layer only**. It must not become a privileged API surface.

Hard rules:
- bind loopback only (`127.0.0.1`)
- fixed port (`43117`) for stable origin/session behavior
- allow only `GET` / `HEAD`
- reject non-allowed `Host` headers
- prevent path traversal in packaged static serving
- no open proxy behavior in dev (only registered entry prefixes proxy to the fixed upstream Forge origin)

Renderer security policy is still enforced by Electron header interception in `src/main/index.js`, with renderer-document detection delegated to `rendererEntryService.isRendererDocumentUrl(...)`.

## Failure Modes
### Port conflict (`EADDRINUSE`)
If `127.0.0.1:43117` is already in use, Haven fails fast on startup and shows a blocking error dialog.

Reason:
- stable origin is required for renderer storage/session continuity and strict dev/package parity.

### Dev proxy target unavailable
If Forge's webpack dev server is not ready, the local loopback server still starts but returns a local diagnostic page (502) for renderer requests.

### One-time packaged re-login after rollout
Switching packaged builds from `file://` to `http://127.0.0.1:43117` changes origin-scoped browser storage.

Expected impact:
- one-time sign-out / re-login
- one-time reset of renderer `localStorage` UI prefs

After re-login, session persistence should remain stable because the origin is now fixed.

## CSP / Referrer Alignment
- Renderer document CSP is built via `src/main/renderer-entry-csp.js`
- `Referrer-Policy: origin` is injected for renderer document responses
- iframe embeds still use `referrerPolicy="origin"` in `src/components/MessageList.tsx`

This keeps referrer behavior explicit and consistent across modes.

## Sequence Flow
### App startup (dev + packaged)
1. `app.whenReady()` in `src/main/index.js`
2. `createRendererEntryService(...)`
3. `rendererEntryService.start()`
4. Register renderer-document CSP/header policy using `rendererEntryService.isRendererDocumentUrl(...)`
5. `createWindow()`
6. `window.loadURL(rendererEntryService.getEntryUrl('main_window'))`

### Dev request path
1. BrowserWindow requests `http://127.0.0.1:43117/main_window/`
2. RendererEntryService receives request
3. Validates host/method/path prefix
4. Proxies to Forge webpack dev server upstream
5. Proxies websocket upgrades for HMR under the same loopback origin

### Packaged request path
1. BrowserWindow requests `http://127.0.0.1:43117/main_window/`
2. RendererEntryService receives request
3. Validates host/method/path prefix
4. Serves `index.html` / assets from packaged renderer output directory

## Release / Smoke Gate
Changes touching any of the following require packaged parity smoke testing (`npm run make`):
- `src/main/index.js`
- `src/main/renderer-entry-service.js`
- `src/main/renderer-entry-csp.js`
- renderer embed behavior / iframe policies

Required smoke checks:
1. YouTube embed renders in dev and packaged (no error 153)
2. Vimeo embed renders in dev and packaged
3. Uploaded video attachment playback still works
4. Re-login once after upgrade, then session persists across relaunch

## Extension Path
Future windows should register additional renderer entrypoints in `RendererEntryService` rather than loading Forge entry constants directly.

Do not introduce parallel renderer-loading strategies (`file://` in one window, loopback HTTP in another).

## Files to Know
- `src/main/index.js`
- `src/main/renderer-entry-service.js`
- `src/main/renderer-entry-csp.js`
- `src/components/MessageList.tsx`
- `forge.config.js`

