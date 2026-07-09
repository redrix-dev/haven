//! Newline-delimited JSON protocol between the Tauri shell and this sidecar.
//!
//! One JSON object per line, in both directions (see the `main.rs` header for
//! the transport). Structured payloads (device lists, volume values, speaking
//! rosters) don't fit the old plain-text `mute|unmute|leave` scheme, so the
//! wire format is tagged JSON: `{"type":"mute"}`, `{"type":"connected"}`, etc.

use serde::{Deserialize, Serialize};

/// A control command from the Tauri app — one JSON object per stdin line.
///
/// `#[serde(tag = "type")]` gives the discriminated-union shape the TS bridge
/// mirrors (`VoiceCommand`). Unknown commands fail to deserialize and are
/// logged + ignored by the reader loop, so the sidecar never panics on garbage.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Command {
    /// Mute the local microphone track.
    Mute,
    /// Unmute the local microphone track.
    Unmute,
    /// Leave the room and shut the sidecar down.
    Leave,
    /// Switch the capture (microphone) device, keyed by cpal device name.
    SetInputDevice { id: String },
    /// Switch the playback (speaker) device, keyed by cpal device name.
    SetOutputDevice { id: String },
    /// Master playback gain, `0.0..=1.0`. Deafen sends `0.0`.
    SetMasterVolume { value: f32 },
    /// Per-participant playback gain, `0.0..=1.0`, keyed by LiveKit identity.
    SetMemberVolume { identity: String, value: f32 },
    /// Ask the sidecar to emit a `devices` event enumerating I/O devices.
    EnumerateDevices,
}

/// A lifecycle/notification event to the Tauri app — one JSON object per
/// stdout line, forwarded verbatim to the webview as a `voice://event`.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    /// The room connection is established (pre track wiring).
    Connected,
    /// Capture + playback are wired and audio is flowing.
    Ready,
    /// The room closed (leave, parent gone, or connection lost).
    Disconnected,
    /// A non-fatal or fatal error, carrying a human-readable message.
    Error { message: String },
    /// Available capture/playback devices, in response to `EnumerateDevices`.
    Devices {
        inputs: Vec<DeviceInfo>,
        outputs: Vec<DeviceInfo>,
    },
    /// Identities currently speaking (drives the Linux speaking indicators).
    /// Identity == Haven user id, so it maps straight onto the roster.
    Speaking { identities: Vec<String> },
}

/// One selectable audio device. `id` is the cpal device name — cpal exposes no
/// stable hardware id, but the name is stable enough to re-select in-session.
#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub label: String,
}
