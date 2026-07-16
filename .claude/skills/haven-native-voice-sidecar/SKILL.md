---
name: haven-native-voice-sidecar
description: Use when changing Linux native voice sidecar code, apps/tauri/haven-voice Rust, the Tauri process host, stage-haven-voice-sidecar tooling, VoiceBridge, voice stdio protocol, LiveKit Rust dependencies, libwebrtc pins, or Linux voice parity.
---

# Haven Native Voice Sidecar

## Read Before Editing

- [docs/architecture/NATIVE_VOICE.md](../../../docs/architecture/NATIVE_VOICE.md)
- [packages/solid-client/src/contexts/BridgeProvider.tsx](../../../packages/solid-client/src/contexts/BridgeProvider.tsx)
- [packages/solid-client/src/contexts/VoiceProvider.tsx](../../../packages/solid-client/src/contexts/VoiceProvider.tsx)
- [apps/tauri/src/bridge.ts](../../../apps/tauri/src/bridge.ts)
- [apps/tauri/src-tauri/src/voice.rs](../../../apps/tauri/src-tauri/src/voice.rs)
- [apps/tauri/haven-voice/src/protocol.rs](../../../apps/tauri/haven-voice/src/protocol.rs)

## Seam Rule

Linux native voice flows through one seam:

```text
useVoice / VoiceProvider
  -> BridgeProvider VoiceBridge
  -> apps/tauri/src/bridge.ts
  -> apps/tauri/src-tauri/src/voice.rs
  -> apps/tauri/haven-voice stdio JSON protocol
```

Add capabilities by extending `VoiceBridge` and the newline-delimited JSON
protocol. Do not add a second abstraction or a side path in UI.

## Platform Rule

- Linux uses the sidecar because WebKitGTK has no WebRTC.
- macOS, Windows, and web stay in-webview with `livekit-client`.
- The Tauri app does not link libwebrtc; only `apps/tauri/haven-voice` does.
- Audio is mono for voice. Do not "upgrade" the sidecar to stereo.

## Protocol Discipline

- Commands and events are tagged JSON objects, one per line.
- Keep protocol changes mirrored between Rust `protocol.rs`, TypeScript
  `VoiceBridge`/`VoiceEvent`, and callers.
- User identities are Haven user ids. Preserve that mapping for roster,
  speaking, and per-member volume.
- The popout is a mirror/remote control. It must not open its own LiveKit
  connection.
- The desktop popout launcher is intentionally hidden today. BroadcastChannel
  does not reliably cross Tauri `WebviewWindow`s here; keep it hidden until sync
  moves to a Tauri event-backed protocol.

## Dependency Pin Discipline

The sidecar currently pins LiveKit Rust to a git revision to get a compatible
unreleased `libwebrtc` set.

- Do not bump LiveKit casually.
- Prefer returning to crates.io once a release pulls `libwebrtc >= 0.3.39` or an
  otherwise ABI-compatible set.
- If the git revision changes, verify from a clean build and commit the updated
  `apps/tauri/haven-voice/Cargo.lock`.

## Validation

- `cargo fmt --manifest-path apps/tauri/haven-voice/Cargo.toml -- --check`
- `cargo build --locked --manifest-path apps/tauri/haven-voice/Cargo.toml`
- `node tooling/scripts/stage-haven-voice-sidecar.mjs --debug` when testing
  Linux sidecar bundling/staging behavior locally
- `cargo fmt --manifest-path apps/tauri/src-tauri/Cargo.toml -- --check` when
  Tauri Rust host code changes
- `cargo check --manifest-path apps/tauri/src-tauri/Cargo.toml` when Tauri Rust
  host code changes
- `npm run typecheck:solid` when TypeScript bridge/provider code changes

Manual release confidence for Linux voice still requires connect, mute, deafen,
device switch, per-member volume, and speaking tests with a second participant.
