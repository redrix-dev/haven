---
name: haven-tauri-desktop-shell
description: Use when changing the Haven Tauri desktop shell, apps/tauri bootstrap, Tauri config, capabilities, custom window chrome, deep links, updater bridge, persistence, popout windows, boot splash behavior, or shell-injected HavenBridge capabilities.
---

# Haven Tauri Desktop Shell

## Read Before Editing

- [docs/architecture/SOLID_CLIENT_SHAPE.md](../../../docs/architecture/SOLID_CLIENT_SHAPE.md)
- [docs/architecture/NATIVE_VOICE.md](../../../docs/architecture/NATIVE_VOICE.md) for
  voice or popout work
- [apps/tauri/src/bridge.ts](../../../apps/tauri/src/bridge.ts)
- [packages/solid-client/src/contexts/BridgeProvider.tsx](../../../packages/solid-client/src/contexts/BridgeProvider.tsx)
- [apps/tauri/src-tauri/src/lib.rs](../../../apps/tauri/src-tauri/src/lib.rs)
- [apps/tauri/src-tauri/tauri.conf.json](../../../apps/tauri/src-tauri/tauri.conf.json)
- [apps/tauri/src-tauri/capabilities/default.json](../../../apps/tauri/src-tauri/capabilities/default.json)

## Shell Boundary

`packages/solid-client` is shell-agnostic. It must run in Tauri and in a plain
browser tab.

- Solid UI consumes `HavenBridge` from `@solid-client/bridge`.
- Tauri implements that bridge in `apps/tauri/src/bridge.ts`.
- Browser/web fallback lives in `BridgeProvider.tsx`.
- Do not import `@tauri-apps/*` in `packages/solid-client`.
- New shell capabilities extend `HavenBridge`; they do not become direct Tauri
  imports in features.

## Boot Contract

- `apps/tauri/src/main.tsx` creates `HavenSolidCore` before rendering `<App>`.
- `getTauriSupabaseConfig()` reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` at Vite build time.
- Missing env values make packaged boot fail before the splash clears; the boot
  catcher renders the error into the splash.
- Release builds must provide those Vite envs in the desktop release workflow.
- The splash is inline in `apps/tauri/index.html` and is removed before Solid
  render. Do not mount UI over it.

## Tauri Config Ownership

- Base app, updater, deep link, and default window config:
  `apps/tauri/src-tauri/tauri.conf.json`
- Linux-only external sidecar binary:
  `apps/tauri/src-tauri/tauri.linux.conf.json`
- macOS titlebar, entitlements, and minimum OS:
  `apps/tauri/src-tauri/tauri.macos.conf.json`
- Native command/plugin wiring:
  `apps/tauri/src-tauri/src/lib.rs`
- Capability permissions:
  `apps/tauri/src-tauri/capabilities/default.json`

If a bridge method needs a Tauri permission, update capabilities in the same
change.

## Deep Links And Single Instance

- `tauri-plugin-single-instance` must stay first in the builder chain.
- Windows/Linux second launches forward `haven://` args through the
  `deep-link-url` event.
- macOS/plugin delivery uses `onOpenUrl`.
- Cold start links are read through `getCurrent()`.
- Keep all three paths when touching deep links.

## Popout Windows

- A popout is a route rendered in an OS viewport.
- Window creation and sizing belong to the Tauri bridge.
- Routes and UI remain in `packages/solid-client`.
- `voice-popout` is listed in capabilities because it may receive bridge
  permissions.
- Current desktop voice popout is intentionally hidden. BroadcastChannel does
  not reliably cross Tauri `WebviewWindow`s here; do not re-enable it until sync
  moves to a Tauri event-backed protocol.

## Persistence

- Tauri persistence prefers `tauri-plugin-store` through
  `createTauriPluginStorePersistence()`.
- Browser dev or plugin failure falls back to shared localStorage persistence.
- Nexus APIs are sync; the plugin-store adapter keeps an in-memory cache and
  writes asynchronously.

## Validation

- `npm run typecheck:solid`
- `npm run lint`
- `npm run build:solid`
- `cargo check --manifest-path apps/tauri/src-tauri/Cargo.toml` for Rust host
  changes
- `npm run tauri:build` when Tauri config, capabilities, bundle config, updater,
  or release boot behavior changed
