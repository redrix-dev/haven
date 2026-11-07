# Voice signalling teardown (HAV-7)

Haven awaits `room.disconnect()` and shares one teardown promise across leave,
channel switches, and unmount. The remaining `error reading from signal stream`
was reproduced inside `livekit-client` 2.23.0, including after the HAV-8 upgrade.

## The SDK race

`Room.disconnect()` sends leave, then closes its engine. The engine originally
awaited native peer cleanup **before** closing its signal client. The server can
close the WebSocket during that native wait. The signal read loop then logs a
failure while its lifecycle still says connected, even though leave is intended.
An empty `roomID` reflects cleared room metadata; it does not prove a stuck call.

The SDK also logged read failures before checking whether their transport was
already closed or superseded. A late leave response could re-arm a ping timeout
after disconnect, causing a second warning about 15 seconds later.

Upstream references:

- [Issue #2191](https://github.com/livekit/client-sdk-js/issues/2191) and
  [PR #2192](https://github.com/livekit/client-sdk-js/pull/2192): expected-close
  read failures should be diagnostics, not errors. The PR review also identifies
  an abnormal-close ordering case that must retain error-level reporting.
- [Issue #2238](https://github.com/livekit/client-sdk-js/issues/2238) and
  [PR #2239](https://github.com/livekit/client-sdk-js/pull/2239): do not re-arm
  ping timeouts after the signal client disconnects.

These fixes were not present in the published 2.23.0 package when HAV-7 was
implemented. There is no public Room API for separately cancelling its reader.

## Temporary mobile compatibility patch

`tooling/scripts/mobile/patch-livekit-signal-teardown.mjs` runs during mobile
postinstall. It validates the exact SDK version and every replacement before
writing. It patches the SDK source and both shipped bundles (ESM and minified
UMD); changing only TypeScript source would leave Metro's runtime unchanged.

The patch closes signalling before awaiting native peer disposal, with peer
cleanup in `finally`. It treats read failures as debug diagnostics only for a
closed/closing lifecycle or an obsolete connection attempt. An unexpected
failure still logs at error level, including when the socket-close callback
already moved the lifecycle offline. It also includes the post-close ping guard.
There is no global logger filter or blanket suppression of WebSocket codes.

`livekitSignalTeardown.test.ts` executes the actual installed ESM and UMD builds
against controllable streams and delayed native peer cleanup. The unpatched SDK
fails leave/timer probes. Tests also cover active failures, socket-close-first
ordering, and an old reader completing after rejoin.
The Node-only package loader is isolated in
`tooling/test-support/mobileLivekitSdk.mjs`: mobile source cannot import Node
built-ins, and this fixture is shared by TypeScript configurations with different
module modes. The `.mjs` boundary keeps those loader details out of mobile code.

When upgrading `livekit-client`, review the patch against the new release and run
these probes before removing it. The version guard deliberately fails installation
instead of silently applying old bundle replacements to an unknown release.

## Device signoff

On the iPhone, join, wait a few seconds, leave, and rejoin several times. Confirm
one session at a time, stopped capture after leave, no signal read error on leave,
and no delayed ping-timeout warning after waiting at least 15 seconds. Genuine
network failures must remain visible; do not validate only by silencing logs.

The captured iPhone 12 Pro Max run on 2026-11-06 contains three successful joins,
three completed disconnects, zero signal-read errors, and zero delayed ping-timeout
warnings. Cody confirmed that rejoins worked cleanly after the interrupted test.
The recovered raw logs and count summary are retained locally under
`test-reports/hav-7/` (gitignored); no repeat phone test was required to recover
that evidence.
