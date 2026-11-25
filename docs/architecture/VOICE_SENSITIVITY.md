# Voice sensitivity control

The mobile voice sheet uses `VoiceSensitivityControl` in place of the percentage
stepper. Its input fill and threshold marker share the same 0–100 axis, matching
the approved #89 mockup. The meter is fed directly by the session's
`localInputLevel`; the control never opens its own microphone capture.

Dragging or tapping changes `VoiceSettings.voiceActivationThreshold` through the
existing settings command and persistence path. Updates are rounded to whole
percentages and repeated values within one drag are ignored. The touch surface
is 44 points high; 12-point insets keep the marker visible at both endpoints.
Dragging uses page-coordinate deltas so movement stays consistent over the
meter's child views. The parent scroll view cannot steal an active adjustment.

VoiceOver/TalkBack see an adjustable control with a labeled numeric range and
one-percent increment/decrement actions. Open-mic mode disables threshold
editing while retaining the live input meter. “Transmitting” reflects the
session's send gate, including its release tail and mute/deafen flags.

Merge #93's input-source fix before signoff: without it, a closed voice-activity
gate still silences the old meter source. This UI change does not substitute a
simulated signal or change the gate algorithm.

## Native signoff

Verify taps and continuous drags from 0 to 100 and back, marker alignment,
vertical scrolling outside the control, accessibility adjustment, and disabled
editing in open-mic mode. Restart and verify the stored threshold. In a real
call with #93, raise the marker above ambient noise and confirm that noise stops
transmitting while the input fill keeps moving. Render/gesture and real-mic
verification are distinct from the headless typecheck and bundle gates.
