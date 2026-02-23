# Voice Architecture (P2P MVP -> SFU Ready)

## Goals
- Ship a working voice MVP with connect/disconnect, per-user volume, and device selection.
- Keep transport/signaling boundaries clear so migration to SFU is low-risk.

## Current Design

### 1) Channel Model
- Voice channels reuse `public.channels.kind = 'voice'`.
- Channel create/edit flows are shared with text channels.

### 2) Presence + Signaling Plane (Supabase Realtime)
- Presence channel key: `voice:{communityId}:{channelId}`.
- Presence payload tracks participant state:
  - `muted`
  - `deafened`
  - `listen_only`
  - `display_name`
- Broadcast event: `webrtc-signal`.
- Signal envelope:
  - `type: 'offer' | 'answer' | 'ice'`
  - `from`, optional `to`
  - `sdp` or `candidate`

### 3) Media Transport
- WebRTC mesh P2P for MVP (one `RTCPeerConnection` per remote participant).
- ICE config fetched through provider-agnostic client API:
  - `src/lib/voice/ice.ts`
- Primary provider: Supabase Edge Function `voice-ice` calling Xirsys.
- Fallback provider: public STUN list.

### 4) Runtime Session Manager
- `VoiceChannelPane` owns:
  - join/leave lifecycle
  - peer map + pending ICE buffers
  - track replacement for input-device switching
  - local mute/deafen/listen-only state
  - per-user output volume controls
  - optional output-device routing (`setSinkId` when supported)

### 4.1) Local Voice Hardware Debug Panel (Feature Flagged)
- Purpose: test microphone capture + speaker playback before joining a voice session.
- Renderer-only diagnostic UI behind feature flag: `debug_voice_hardware_panel`.
- Hotkey toggle: `Ctrl/Cmd + Alt + Shift + V`.
- Capabilities:
  - microphone permission/device test with live sound meter,
  - debug-only input gain slider (client-side meter gain),
  - speaker output device selection (`setSinkId` when supported),
  - speaker test playback + speaker volume slider.
- Speaker test clip is bundled from `src/assets/audio/voice-debug-speaker-test.mp3` via webpack
  asset import so it ships with the renderer build.

### 5) Security Boundary
- Xirsys credentials live only in Supabase secrets.
- Renderer never receives Xirsys secret/ident directly.
- Renderer only receives normalized `iceServers` from `voice-ice`.
- `voice-ice` validates JWT + channel access (`communityId`, `channelId`, `kind='voice'`) before
  returning relay credentials.
- Client treats `401/403` from `voice-ice` as hard auth failures (no STUN fallback on auth deny).

## Why This Is SFU-Friendly
- Signaling envelope is already abstract enough to route through SFU flows.
- ICE acquisition is already provider-agnostic (`fetchIceConfig`).
- UI and device controls are independent from signaling backend.

## Planned Migration to SFU
1. Keep presence channel as membership/state source.
2. Replace mesh peer map with one uplink/downlink session to SFU.
3. Keep `fetchIceConfig` interface but point to SFU token/ICE endpoint.
4. Preserve existing UI controls (mute/deafen/volume/device).
5. Introduce server-side moderation hooks (force mute/move) against SFU API.

## MVP Test Cases
1. Create voice channel.
2. Join voice with two accounts.
3. Verify audio both directions.
4. Leave/rejoin repeatedly.
5. Switch mic device while connected.
6. Adjust per-user volume and confirm local-only effect.
7. Toggle deafen and confirm local mute of incoming audio.
8. Disconnect network briefly and retry ICE.
9. (Flagged) Open voice hardware debug panel and verify mic meter + speaker test work before join.
