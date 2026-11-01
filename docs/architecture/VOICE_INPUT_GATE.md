# Voice capture and transmission

Mobile measures the microphone's WebRTC `media-source.audioLevel` through the
published track's sender stats, every 80 ms with at most one request in flight.
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

If native sender stats stop reporting capture levels while an encoding is
inactive, this strategy requires a native capture monitor; do not substitute
`localParticipant.audioLevel` (the server's outgoing-audio feedback).
