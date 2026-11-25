# Voice capture and transmission

For leave/rejoin lifecycle and signal-stream errors, see
[Voice signalling teardown](./VOICE_SIGNAL_TEARDOWN.md).

Mobile measures the microphone's WebRTC `media-source.audioLevel` through the
published track's sender stats, every 80 ms with at most one request in flight.
On iOS those sender stats stop reporting capture levels once an encoding is
deactivated, so iOS additionally feeds the gate the native LiveKit capture
monitor (`LK_VOLUME_PROCESSED` events from a native renderer that measures the
microphone before RTP). Every reading re-timestamps the sample — including
silence — so freshness tracks reading arrival, not value change. While the
monitor's sample is fresh it is the level the gate and the meter read; sender
stats remain the fallback on Android and when a monitor goes stale. Hard mute
and deafen zero the level and close the gate no matter what any monitor
reports.

## iOS capture lifetime (HAV-8)

On an iPhone 12 Pro Max, the original encoding gate was observed to stop both
sender levels and native `LK_VOLUME_PROCESSED` callbacks. Native sample age grew
from 5 ms to over 10 seconds while `track.enabled` stayed true. Gating the track
instead also stopped native callbacks. A monitor before RTP is not enough if
WebRTC stops the recording that feeds it.

The mobile LiveKit packages are upgraded together to expose the supported
`AudioDeviceModule` recording APIs: React Native SDK 3.1.0, WebRTC 150.1.1,
Expo plugin 1.1.0, and `livekit-client` 2.23.0. iOS explicitly starts local
recording and enables always-prepared mode while the user is unblocked. Mute,
deafen, disconnect, and leave clear prepared mode and stop local recording.
Prepared mode alone did not fix the device failure: closing the last encoding
still stopped active recording. After sampling, the controller checks the SDK's
`isRecording()` state and restarts local recording only when unblocked and
stopped. It does not periodically transmit audio or reopen the encoding to meter.
The existing shared threshold/release-tail gate still controls RTP encodings.
Native requests are serialized and duplicate requests share the same promise,
so a pending start finishes before a later mute/leave stops recording.

This requires prebuild and a new native binary. An OTA cannot supply the new
native SDK APIs. Runtime version 1.1.0 separates these binaries from the previous
1.0.0 OTA population. The custom PCM-gating experiment was parked in favor of
these SDK-owned lifecycle controls.

With recording-state reconciliation, the phone kept native samples fresh through
over a minute of silence (typically 10–40 ms old). At an unchanged 18% threshold,
the trace showed 59.3% input opening the gate, 15.8% closing it, then 25.6%
reopening it. This proves local gate recovery, not remote audibility or the full
route-change and background signoff below. Cody also confirmed mute/unmute and
deafen/undeafen on the phone. Blocked traces showed gate closed, track disabled,
recording stopped, and prepared mode off; unblocking restored fresh native
samples and speech reopening. No second participant was available to confirm
remote audibility. Android native validation remains outstanding after the SDK
upgrade.

### References and alternatives

- [React Native WebRTC AudioDeviceModule](https://github.com/livekit/react-native-webrtc/blob/main/src/AudioDeviceModule.ts):
  `startLocalRecording`, `stopLocalRecording`, `setRecordingAlwaysPreparedMode`,
  and microphone mute modes. These APIs are present in the installed 150.1.1.
- [LiveKit local recording](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/audiomanager/startlocalrecording%28audioprocessingoptions%3A%29/):
  the Swift SDK documents microphone buffers independent of a room. Its native
  engine is relevant context, but the RN integration still needs device proof.
- [LiveKit mute modes](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/microphonemutemode/):
  mixer mute keeps the audio engine running; restart mute does not support muted
  speech detection. Neither description proves raw RMS survives mute in RN.
- [LiveKit 3.0 migration](https://github.com/livekit/client-sdk-react-native/releases/tag/%40livekit/react-native%403.0.0):
  native WebRTC symbols gain an LK prefix. SDK, WebRTC, and Expo plugin must move
  together; do not mix old native binaries with the new JS packages.
- [Apple input mute](https://developer.apple.com/documentation/avfaudio/avaudioinputnode/isvoiceprocessinginputmuted):
  exposes voice-processing mute; this does not promise an independent raw meter.
- [Expo custom native code](https://docs.expo.dev/workflow/customizing/) and
  [React Native typed events](https://reactnative.dev/docs/the-new-architecture/native-modules-custom-events):
  if a custom bridge becomes necessary, prefer a local Expo module with explicit
  event/lifecycle ownership over adding another audio engine or recorder.

Development traces emit `voice.capture.start` / `voice.capture.stop` after native
recording requests complete. `voice.input-gate` records source, sample age,
input level as a percentage, threshold (0–100), mode, gate, block, and track
state, plus SDK recording/prepared state, on transitions and once per second
otherwise. A healthy iOS call keeps
fresh native samples while RTP is gated. These logs do not prove remote audibility.

For incremental native validation on Expo SDK 58, use
`expo prebuild --platform ios --no-install --no-clean` when retaining the existing
native project is intended. Prebuild now recreates native folders by default;
omitting `--no-clean` discards Pods and causes unnecessary full native recompiles.
Use the default clean regeneration when proving the project builds from scratch.

`VoiceInputGate` keeps capture enabled while voice activation closes outgoing
RTP encodings (`RTCRtpEncodingParameters.active`). Disabling the source track
for voice activation creates a feedback loop: silence closes the gate, then
the disabled capture can never measure the sound that would reopen it.

Hard mute and deafen still disable capture. Missing encodings or a failed sender
update fail closed. The gate uses a 220 ms release tail. Disconnect stops polling;
pending stats from an old session cannot reopen its microphone.

Desktop/web currently only applies mute/deafen. Transmission mode support must
be wired before exposing its mode settings in the call screen (#92).

## Native signoff

Unit probes exercise the gate against a sender whose capture reads zero when its
source is disabled; they do not prove native capture or remote audibility.
On both iOS and Android, join with a second participant and verify:

1. Select voice activation and a threshold above zero. Wait in silence until
   transmission closes, then speak: the meter must move and the remote must hear
   you. Repeat several times without changing modes.
2. Raise the threshold above room noise: noise must stop transmitting, while the
   meter continues measuring it. Speech above the threshold must reopen it.
3. Hard mute and deafen must silence transmission immediately; unmute/undeafen
   must recover. Open mic must remain audible.
4. Leave, rejoin, and repeat; background/foreground and change audio route.

iOS sender stats are known to stop reporting capture levels while an encoding
is inactive; that is why the gate accepts a platform capture monitor. Do not
substitute `localParticipant.audioLevel` (the server's outgoing-audio
feedback).
