# Voice confirmation sounds

Voice cues use one portable policy (`features/voice/utils/voiceSounds.ts`) with
platform players. They are enabled by default at 50% volume. The voice nexus
persists device preferences through `NexusPersistence`; session cleanup and
sign-out preserve them. Notifications retain their separate preferences and
focus/throttle policy. The old notification voice-presence API and hardcoded
web join/leave player are removed.

Local join, leave, mute/unmute and deafen/undeafen always request an independent
player. They are not suppressed by window focus or a global timer. Web remote
join/leave cues use the same policy. A muted/zero-volume preference skips player
creation. Playback failure never interrupts the voice action.

## Assets

The original connect/disconnect sounds are unchanged. Derived PCM WAVs preserve
their pitches, with 5 ms fades at the cut edges:

| Action   | Original                | Segment                       |
| -------- | ----------------------- | ----------------------------- |
| Unmute   | Connect (ascending)     | Final note, from 0.334 s      |
| Mute     | Disconnect (descending) | Final note, from 0.334 s      |
| Deafen   | Connect (ascending)     | Final two notes, from 0.174 s |
| Undeafen | Disconnect (descending) | Final two notes, from 0.174 s |

Regenerate on macOS with `python3 tooling/scripts/audio/extract-voice-action-sounds.py`.

## Routing and lifecycle

Web sets each audio element's sink to the selected voice output **before** playing.
A browser without sink selection can play on the default output; an explicitly
selected unsupported sink fails visibly in the diagnostic log instead of sending
the cue to another device. Each invocation owns its element, so rapid actions
do not cancel one another.

Mobile uses the CNG-generated `HavenVoiceSounds` module. iOS AVAudioPlayer shares
LiveKit's existing AVAudioSession without changing category, mode, activation or
route. Android MediaPlayer uses voice-communication audio attributes to follow
the selected communication device rather than the media output. Players release
after completion/error and have a two-second watchdog. The leave cue finishes
before the audio session stops; microphone capture is disabled immediately when
leaving. No new third-party playback dependency is required.

The plugin/templates are the source of truth. A native rebuild is required;
an OTA alone cannot install this module.

## Signoff

Run `test:cleave`, Solid typecheck, mobile theme/typography checks, native
prebuild and builds. The web player regression tests assert the sink, actual
player volume, all six invocations without a throttle, and persisted opt-out.
Mutation-check the sink and volume assertions before trusting them.

On iOS and Android, join a two-person call, select speaker/headset/Bluetooth in
turn, and verify that every cue follows the voice output without disrupting
remote audio or microphone capture. Rapidly mute/unmute, deafen/undeafen, then
leave/rejoin. Restart and verify saved enabled/volume settings. Browser sink
selection, autoplay restrictions and Linux WebKitGTK playback also need direct
verification; unit tests do not establish acoustic routing.
