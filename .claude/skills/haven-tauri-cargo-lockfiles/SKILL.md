---
name: haven-tauri-cargo-lockfiles
description: Use when changing Tauri Rust dependencies, Cargo.toml/Cargo.lock files, apps/tauri/src-tauri, apps/tauri/haven-voice, Rust toolchain/build commands, sidecar staging, platform-specific dependency resolution, or lockfile churn from Windows/Linux/macOS builds.
---

# Haven Tauri Cargo Lockfiles

## Read Before Editing

- [apps/tauri/src-tauri/Cargo.toml](../../../apps/tauri/src-tauri/Cargo.toml)
- [apps/tauri/haven-voice/Cargo.toml](../../../apps/tauri/haven-voice/Cargo.toml)
- [docs/architecture/NATIVE_VOICE.md](../../../docs/architecture/NATIVE_VOICE.md)
- [tooling/scripts/stage-haven-voice-sidecar.mjs](../../../tooling/scripts/stage-haven-voice-sidecar.mjs)
- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)
- [.github/workflows/release-desktop.yml](../../../.github/workflows/release-desktop.yml)

## Two Workspaces

There are two independent Cargo workspaces:

- Tauri app host:
  - manifest: `apps/tauri/src-tauri/Cargo.toml`
  - lockfile: `apps/tauri/src-tauri/Cargo.lock`
- Linux native voice sidecar:
  - manifest: `apps/tauri/haven-voice/Cargo.toml`
  - lockfile: `apps/tauri/haven-voice/Cargo.lock`
  - standalone `[workspace]` by design

Do not merge the sidecar into the Tauri app workspace. It is isolated so
libwebrtc and LiveKit Rust cannot leak into the app host or non-Linux bundles.

## Lockfile Rule

- Use `cargo build --locked` or `cargo check --locked` for verification.
- Commit a Cargo.lock change only when the matching Cargo.toml or intentional
  dependency update requires it.
- Platform-only lockfile churn is not a feature change. Inspect it before
  committing.
- If Windows drops Linux-only sidecar dependencies or Linux adds them back, do
  not bless the churn blindly. Regenerate/verify from the platform that owns the
  dependency surface, usually Linux for `haven-voice`.

## Platform Ownership

- `src-tauri` is cross-platform Tauri host code.
- `haven-voice` is Linux-shipped today, even though some dependencies have
  platform entries in the lockfile.
- Linux sidecar build needs ALSA, GTK/glib/WebKit stack libraries, pkg-config, a
  C++ toolchain, network access to the LiveKit git rev, and the prebuilt
  libwebrtc download host.
- macOS and Windows release jobs should not stage `haven-voice`.

## Sidecar Staging Contract

`tooling/scripts/stage-haven-voice-sidecar.mjs`:

1. Builds `apps/tauri/haven-voice` with `cargo build --locked`.
2. Uses `rustc -vV` to discover the host target triple.
3. Copies the binary to
   `apps/tauri/src-tauri/binaries/haven-voice-<triple>[.exe]`.

Tauri requires the target-triple suffix at bundle time and strips it at runtime.
The staged `binaries/` directory is gitignored; never commit staged binaries.

## Dependency Update Procedure

1. Identify which workspace owns the dependency.
2. Edit only that workspace's `Cargo.toml`.
3. Run the narrow update from that workspace when possible.
4. Run locked verification:
   - `cargo check --locked --manifest-path apps/tauri/src-tauri/Cargo.toml`
   - `cargo build --locked --manifest-path apps/tauri/haven-voice/Cargo.toml`
     for sidecar changes
5. Review `git diff -- apps/tauri/src-tauri/Cargo.lock apps/tauri/haven-voice/Cargo.lock`.
6. Reject unrelated platform prune/add churn unless the dependency update truly
   requires it.

## WebRTC Pin

The sidecar's `livekit` dependency is pinned to a git revision for an
unreleased libwebrtc-compatible set. When that pin changes:

- Verify `livekit`, `livekit-api`, `livekit-protocol`, `libwebrtc`,
  `webrtc-sys`, and `webrtc-sys-build` still resolve as a compatible set.
- Prefer returning to crates.io once LiveKit releases a compatible version.
- Build from a clean sidecar target when possible. Cached success is not proof
  for this dependency.
- Commit the sidecar `Cargo.lock` in the same change if the pin changes.

## Quick Diff Triage

- `apps/tauri/src-tauri/Cargo.lock` changed but no `src-tauri/Cargo.toml`
  dependency changed: suspect accidental toolchain/platform churn.
- `apps/tauri/haven-voice/Cargo.lock` changed on Windows with no sidecar
  dependency change: suspect Linux dependency pruning.
- Both lockfiles changed for a JS-only desktop UI tweak: almost certainly
  accidental.
