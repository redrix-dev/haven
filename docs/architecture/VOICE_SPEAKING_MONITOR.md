# Speaking indicators

LiveKit's `participant.isSpeaking`, `participant.audioLevel`, and
`room.activeSpeakers` are populated by the same server speaker update in the
installed SDK (`Room.handleSpeakersChanged`). Changing the event subscription
alone cannot improve the cadence.

The mobile and Solid session hosts use `monitorSpeaking` instead. It reads the
microphone capture's `media-source.audioLevel` for self and the receiver's
`inbound-rtp.audioLevel` for remote tracks every 80 ms. Samples above 0.015 light
the ring, with a 160 ms release tail. SDK participant state is a fallback when a
platform does not supply audio levels. The monitor publishes only boolean
transitions or roster changes, not every sample; only one sampling batch runs
at a time, and teardown ignores late stats results.

Self must have capture enabled and an active outgoing encoding. An open gate
alone is not speaking: open mic in a quiet room must not light the ring.
Mobile voice activation additionally needs #88's capture/transmission fix;
desktop transmission-mode controls remain tracked in #92. Native Linux sidecar
speaking events remain independent of this WebRTC monitor.

## Verification

The regression tests drive changing receiver/capture stats while server speaker
state stays false, count UI-facing notifications, and cover stopped monitors.
For native/browser signoff, use two participants, alternate brief speech and
silence, and verify rings against audible speech. Repeat with voice activation,
hard mute, deafen, reconnect, and push-to-talk on hosts that expose that mode.
The tests do not measure real device latency; clients without audio-level stats
retain the server cadence and require a platform analyser for faster feedback.
