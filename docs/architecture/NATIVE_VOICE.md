# Native voice (Linux) — the sidecar, its seam, and the WebRTC pin

Maintained alongside [SOLID_CLIENT_SHAPE.md](./SOLID_CLIENT_SHAPE.md). Voice on
desktop normally runs in-webview via `livekit-client`. **Linux can't** —
WebKitGTK ships no WebRTC — so on Linux we run a native Rust sidecar
(`apps/tauri/haven-voice`) that does the media, and the UI drives it through one
seam. This doc is the contract for that sidecar and, critically, for the
**unreleased libwebrtc pin** it depends on.

## Why a sidecar

- WebKitGTK (the Linux Tauri webview) has no WebRTC, so `livekit-client` cannot
  connect from the webview. mac (WKWebView) and Windows (WebView2) can, and the
  browser build can, so **only Linux** needs the sidecar today.
- Running media in a separate process also isolates crashes: a libwebrtc fault
  takes down the sidecar, not the app. The Tauri app never links libwebrtc.

## The seam (single extension point)

The UI never knows about the sidecar's internals. Everything flows through the
`VoiceBridge` capability:

```
useVoice() / VoiceProvider (packages/solid-client/src/contexts/VoiceProvider.tsx)
        │  gated by  bridge.platform === "linux"  ->  bridge.voice
        ▼
VoiceBridge  (contexts/BridgeProvider.tsx)          ← the seam; extend HERE
        │  implemented by
        ▼
tauriBridge.voice  (apps/tauri/src/bridge.ts)       ← invoke() ⇄ Rust commands
        │  stdio (newline-delimited JSON)
        ▼
voice.rs commands  (apps/tauri/src-tauri/src/voice.rs)   ← spawn / drive / kill
        │  stdin: commands       stdout: events
        ▼
haven-voice sidecar  (apps/tauri/haven-voice/src/*)  ← LiveKit + cpal + libwebrtc
```

**Rule: new voice capability extends `VoiceBridge` and the JSON protocol — it
does not add a new abstraction.** The web/mac/win path stays on the in-webview
`Room`; the Linux path routes the same `useVoice()` action to `bridge.voice`.

### The stdio protocol

Newline-delimited JSON, one tagged object per line, defined in
`apps/tauri/haven-voice/src/protocol.rs` and mirrored by `VoiceEvent` /
`VoiceBridge` in `BridgeProvider.tsx`.

| Direction                | Messages                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI → sidecar (`Command`) | `mute`, `unmute`, `leave`, `enumerateDevices`, `setInputDevice{id}`, `setOutputDevice{id}`, `setMasterVolume{value}`, `setMemberVolume{identity,value}` |
| sidecar → UI (`Event`)   | `connected`, `ready`, `disconnected`, `error{message}`, `devices{inputs,outputs}`, `speaking{identities}`                                               |

Identity keys (`setMemberVolume`, `speaking`) are the **Haven user id** — the
voice-token function mints the LiveKit participant identity as the user id, so
sidecar identities map straight onto the UI's `memberVolumes` / roster.

### Feature parity notes

- **Roster & speaking:** there's no in-webview `Room` on Linux, so the roster is
  driven by the Supabase presence channel (`voiceSolidNexus.syncRoster`), and
  speaking is overlaid from the sidecar's `speaking` event
  (`VoiceSolidNexus.setSpeakingIds`). Reconcile-by-userId keeps `<For>` row
  identity stable — this is what keeps the WebKitGTK DOM tree valid.
- **Devices / volume / deafen:** the sidecar rebuilds its cpal capture/playback
  streams on device switch (channels + mixer stay stable), applies per-member
  gain before the mixer, and uses the mixer's master gain for deafen.
- **Audio is mono.** Voice is mono; LiveKit downmixes received audio to mono and
  DTX is mono-only. Do not "upgrade" the sidecar to stereo for voice.

### Known duplication (do not merge yet, just know)

`HavenBridge.voice` (this seam) and
`packages/shared/src/infrastructure/platform/appHost.ts`
(`VoiceRuntimeBridge` / `enumerateDevices`, the mobile/shared platform surface)
are two overlapping "voice bridge" concepts. The desktop native path uses the
`VoiceBridge` seam, not `VoiceRuntimeBridge`. If a third surface ever needs the
sidecar, consolidate them then — not before.

## The WebRTC / libwebrtc pin ⚠️

This is the one dependency in the repo that needs **active watching**.

### What is pinned, and why

`apps/tauri/haven-voice/Cargo.toml` depends on `livekit` via **git**, not
crates.io:

```toml
livekit = { git = "https://github.com/livekit/rust-sdks",
            rev = "3dafb1d8e8fc49b907a7c4a74cf342dfcbb24c4f",
            features = ["rustls-tls-native-roots"] }
```

The crates.io release of `livekit` pulls **libwebrtc 0.3.38**, which has a 3-arg
`store_frame_metadata` while `webrtc-sys 0.3.36` expects 4 — an ABI mismatch
across the FFI boundary that fails to build. The fix, **libwebrtc 0.3.39**, only
exists in LiveKit's git tree (unreleased on crates.io at time of writing), so we
pin the exact rev that provides an internally consistent set.

### The compatible set (all from that one rev)

| Crate              | Version                 |
| ------------------ | ----------------------- |
| `livekit`          | 0.7.50                  |
| `livekit-api`      | 0.5.4                   |
| `livekit-protocol` | 0.7.10                  |
| `libwebrtc`        | **0.3.39** (unreleased) |
| `webrtc-sys`       | 0.3.36                  |
| `webrtc-sys-build` | 0.3.18                  |

They resolve from the single git rev, so they cannot drift apart as long as the
rev pin and the committed `apps/tauri/haven-voice/Cargo.lock` are kept.

### Risk surface

- **Blast radius is contained.** Only `haven-voice` links libwebrtc. The Tauri
  app, mobile, and web never do. Today the sidecar ships **Linux only**
  (`tauri.linux.conf.json` `externalBin`), so mac/win users are unaffected.
- **Build needs network + a C++ toolchain.** `webrtc-sys-build` downloads a
  prebuilt libwebrtc over HTTPS from a Google-hosted origin
  (`chromium.googlesource.com`) at build time, and `webrtc-sys` compiles a C++
  shim (needs `pkg-config`, a C++ compiler). cpal needs `libasound2-dev` on
  Linux. CI installs these; see `.github/workflows/{ci,release-desktop}.yml`.
- **Reproducibility depends on those hosts staying up** and the rev staying
  reachable. The committed `Cargo.lock` locks resolution; `cargo build --locked`
  in the `sidecar` CI job proves it stays consistent.

### Upgrade / watch procedure

Do **not** bump `livekit` casually — a naive bump can reintroduce the exact
0.3.38-vs-0.3.36 mismatch. When you touch it:

1. **Watch for the drop:** the pin can go away once crates.io ships a `livekit`
   release whose `libwebrtc` is ≥ 0.3.39 (or otherwise ABI-matched to its
   `webrtc-sys`). Check the [rust-sdks releases](https://github.com/livekit/rust-sdks/releases)
   and the libwebrtc version it pulls.
2. Prefer moving **back to a crates.io version** (drop the `git`/`rev`) once (1)
   holds — that removes the git-fetch + prebuilt-download fragility.
3. If staying on git, bump the `rev` and **re-verify the whole set** builds from
   scratch (`cargo build --locked` in `apps/tauri/haven-voice`) — never trust a
   partial/cached build for a WebRTC bump.
4. Commit the regenerated `Cargo.lock` in the same change.
5. Run the full Linux voice pass (connect, mute, deafen, device switch,
   per-member volume, speaking with a second participant) before shipping.

## Where things live

- Sidecar: `apps/tauri/haven-voice/src/{main,protocol,audio_capture,audio_mixer,audio_playback,db_meter}.rs`
- Process host: `apps/tauri/src-tauri/src/voice.rs`
- Bundling: `apps/tauri/src-tauri/tauri.linux.conf.json`,
  `tooling/scripts/stage-haven-voice-sidecar.mjs`
- Seam: `packages/solid-client/src/contexts/BridgeProvider.tsx`,
  `apps/tauri/src/bridge.ts`
- UI/session: `packages/solid-client/src/contexts/VoiceProvider.tsx`,
  `packages/solid-client/src/data/voice/voiceSolidNexus.ts`
