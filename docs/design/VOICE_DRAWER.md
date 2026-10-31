# Voice drawer and participant controls (#92)

Approved product behavior from the October 31 design discussion. This document
is an implementation specification, not a claim that the surfaces exist yet.

## Three levels of detail

The existing dock becomes a drawer. Collapsing it never leaves the call.

1. **Collapsed:** “Voice connected” and the channel name, with mute, deafen,
   leave, and an audio-settings cog exposed. Keep the information density of
   an on-air radio room. The cog opens microphone/device settings.
2. **Expanded:** the same header and controls, plus small participant avatars
   and names. Speaking produces a reactive halo. Hovering a participant reveals
   an ellipsis; keyboard focus and touch must expose the same actions.
3. **Full voice modal:** the header's conventional expand icon opens a larger
   mobile-like call surface with larger avatars/names and the same actions.
   Returning to the drawer preserves its expansion state and the voice session.

The full surface is an in-app modal, not the existing separate-window popout.
Do not enable the Tauri popout until its cross-window transport is repaired.

## Participant actions

Everyone can adjust their own perceived volume of another participant and mute
them locally. These controls affect only this listener. Local unmute restores
their previous volume.

Permission-gated voice actions include removing someone from the channel,
muting/unmuting their microphone, and deafening/undeafening them. A nested
**Community actions** menu exposes existing community kick and ban flows only
when the viewer has the corresponding authority over that member. Preserve
existing owner/role hierarchy rules. UI visibility reflects backend permissions;
it is not the security boundary.

## Remote mute/deafen is reversible participation control

This is a courtesy control, not a punitive moderation lock. Example: someone
walks away with their microphone open and another participant with the right
permissions mutes it. Both a moderator and the affected person can undo the
state change. The affected person uses their ordinary unmute/undeafen controls;
there is no special unlock request and no persistent restriction record.

On receipt, show a persistent, non-expiring notice naming who acted:

> You've been muted by {moderator}. When you're ready to get back to the
> conversation, just unmute normally.

> You've been deafened by {moderator}. When you're ready to get back to the
> conversation, just undeafen normally.

Clear the corresponding notice when that state is undone or the voice session
ends. Preserve the ordinary relationship between deafen and mute; do not add a
second set of microphone rules for remote actions.

Removal uses neutral copy:

> You've been removed from {channel} by {moderator}.

Do not infer whether removal was friendly, disciplinary, or connected to a
community kick/ban. Do not suggest rejoining, display a rejoin CTA, or assume
the person still has access. The notice must survive leaving voice, so it must
not live exclusively in a dock that disappears when disconnected.

## Control transport

Permission checks belong on the server. Derive actor identity from the
authenticated caller; do not accept a caller-supplied actor id/name as proof.
Include the resolved actor display name and channel identity in the event.
Scope actions to the current voice session/channel and ignore stale commands
after leaving or switching channels. Commands change current flags; they do not
create durable mute/deafen restrictions or grant new authority.

Trace the existing `voice:kick` broadcast path before extending it. Current
client kick payloads carry an actor id but no display name; remote mute/deafen
commands do not exist yet. Any new authorization path needs SQL/backend tests,
including ordinary-member refusal and hierarchy boundaries, alongside client
tests proving self reversal and notice lifetime.

## Audio and prerequisites

- #88 repairs voice activation and the capture meter.
- #90 supplies locally measured speaking feedback; SDK participant events alone
  have the same server cadence as `activeSpeakers`.
- #89's threshold-slider mockup awaits visual feedback before implementation.
- #91 adds the shared voice-sound policy and persisted enabled/volume controls.
  Voice sounds default on. Integrate those controls into the settings surface.
- Desktop transmission-mode settings must actually govern sending before the
  drawer exposes them. Persist mode, threshold, devices, and push-to-talk binding.

## Exit criteria

Exercise collapse/expand/modal transitions without leaving the call, keyboard
focus/escape behavior, device selection, all transmission modes, and participant
menus with ordinary-member and moderator accounts. Prove local volume/mute
is listener-only. Prove moderator actions can be reversed by the recipient and
that notices have the approved lifetime and wording. Include Solid settle tests
for any new store-writing effects and actual native/browser voice signoff.
