# haven-voice — QUARANTINED (not built, not shipped)

Desktop no longer ships to **Linux** (macOS + Windows only, 2026-10-30). This
crate is the **Linux-only** native voice sidecar: WebKitGTK has no WebRTC, so on
Linux the Tauri shell spawned this process (native LiveKit + `cpal` audio) and
talked to it over stdio. On macOS/Windows voice runs `livekit-client` directly
in the webview, so none of this is used there.

It is **quarantined, not deleted**: the source stays in the tree, correct and
resurrectable, but nothing in the active build/dependency/CI graph references it.
That keeps its heavy deps (`livekit` git pin, `libwebrtc`/`webrtc-sys`, the
GTK/glib build stack) from being resolved, alerted on, or compiled until we
decide to bring Linux back.

## What severs it from the active graph

| Where | What was removed | Resurrect by |
| --- | --- | --- |
| `.github/workflows/ci.yml` | the `sidecar` lane + its `detect-changes` filter + the `gate` check | restore all three |
| `.github/workflows/release-desktop.yml` | the `haven-voice -> target` cache line (Linux was already out of the build matrix) | restore the cache line + a Linux matrix entry + its apt/sidecar-staging steps |
| `.github/dependabot.yml` | the `cargo` entry for `/apps/tauri/haven-voice` | re-add a `cargo` update entry |
| `apps/tauri/src-tauri/src/lib.rs` | `mod voice`, the `VoiceState` + `voice_*` commands are now `#[cfg(target_os = "linux")]` | nothing — they recompile when the target is Linux |
| `apps/tauri/src-tauri/Cargo.toml` | `tokio` moved to `[target.'cfg(target_os = "linux")'.dependencies]` | nothing — Linux pulls it again automatically |
| `.prettierignore` | this whole directory | remove the ignore |

`apps/tauri/src-tauri/tauri.linux.conf.json` (the `externalBin` that bundles this
sidecar) is left in place, inert — nothing reads it unless a Linux build runs.
`tooling/scripts/stage-haven-voice-sidecar.mjs` is left as a manual tool.

## The one real risk: rot

Because this crate is never built and `src/voice.rs` is `cfg`'d out of the
macOS/Windows build, neither is type-checked by day-to-day work — so they can
silently drift as the rest of the shell evolves.

- The last known-building state is tagged **`linux-voice-last-green`**.
- `.github/workflows/linux-voice-resurrection-check.yml` is a manual
  (`workflow_dispatch`) job that builds both the sidecar and the Tauri shell for
  Linux on demand. Run it before relying on a resurrection to see what has
  rotted, without paying for it on every PR.

## To actually resurrect

1. Reverse the table above.
2. Run the resurrection-check workflow; fix whatever drifted.
3. Re-add a Linux entry to the release matrix and re-test an end-to-end voice
   join on a real Linux build.
