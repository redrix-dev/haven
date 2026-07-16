---
name: haven-tauri-release
description: Use when changing Haven desktop release workflow, desktop versioning, Tauri updater config, release notes, GitHub draft release creation, signing/notarization, release-desktop.yml, desktop tags, or packaged Tauri build behavior.
---

# Haven Tauri Release

## Read Before Editing

- [docs/RELEASE_CADENCE.md](../../../docs/RELEASE_CADENCE.md)
- [docs/releases/README.md](../../../docs/releases/README.md)
- [.github/workflows/release-desktop.yml](../../../.github/workflows/release-desktop.yml)
- [tooling/scripts/check-desktop-version-sync.mjs](../../../tooling/scripts/check-desktop-version-sync.mjs)
- [apps/tauri/src-tauri/tauri.conf.json](../../../apps/tauri/src-tauri/tauri.conf.json)

## Release Trigger

- Desktop releases are triggered only by tags named `desktop-v<semver>`.
- Tags are applied on a `release/*` branch cut from `main`.
- The workflow creates a draft GitHub Release first, then matrix jobs upload
  artifacts to that release by numeric `releaseId`.
- Do not let matrix jobs create releases by tag. GitHub does not return drafts
  from get-by-tag calls, which can create duplicate draft releases and split
  `latest.json`.

## Version Fields

Keep these three fields in sync for every desktop version bump:

- `package.json`
- `apps/tauri/src-tauri/tauri.conf.json`
- `apps/tauri/src-tauri/Cargo.toml`

Validate with:

```bash
npm run check:desktop-version
```

Do not treat `apps/tauri/haven-voice` version as the desktop app version. The
sidecar is an internal Linux binary with its own package version.

## Release Notes

- The workflow reads `docs/releases/<tag>.md` verbatim.
- If the file is absent, it falls back to a generic installer/update body.
- Only publish the sanitized public signoff summary plus human notes.
- Never copy raw `test-reports/` logs, full signoff markdown, JSON, local paths,
  or signer-local details into release notes.
- An empty release note file is worse than absent: the workflow will publish an
  empty body instead of the safe fallback.

## Required Secrets And Env

- Updater/minisign:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Packaged boot config:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- macOS Developer ID signing/notarization:
  - `APPLE_CERTIFICATE`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_SIGNING_IDENTITY`
  - `APPLE_API_KEY_CONTENT`
  - `APPLE_API_KEY`
  - `APPLE_API_ISSUER`

Windows Authenticode signing is not wired in this workflow today. Updater
signing is independent and does not remove SmartScreen prompts.

## Matrix Specifics

- macOS builds universal Apple artifacts with
  `--target universal-apple-darwin`.
- Linux installs WebKitGTK/appindicator/rsvg/patchelf and ALSA dev packages.
- Linux alone builds and stages `haven-voice` before `tauri-action`.
- Windows does not build or stage the Linux sidecar.

## Validation

- `npm run check:desktop-version`
- `npm run build:solid`
- `cargo check --manifest-path apps/tauri/src-tauri/Cargo.toml`
- `cargo build --locked --manifest-path apps/tauri/haven-voice/Cargo.toml`
  when Linux sidecar or release Linux dependencies changed
- `npm run tauri:build` for local packaged smoke when config/release behavior
  changed

Before publishing a draft release, confirm the draft contains all expected
platform artifacts and one combined updater manifest.
