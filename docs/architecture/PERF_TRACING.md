# Perf tracing (`haven-perf`)

A single-clock tracer for mobile launch and session timing. It produced the
analysis behind the `HAV` startup-performance issues. **Dev builds only** — it
is compiled out of / disabled in release (see [Production separation](#production-separation)).

## What it is

- `packages/shared/src/debug/perfTrace.ts` — the framework-free recorder:
  `mark`, `begin`/`end` (spans), `measure`, `flushSummary`, and an `addSink`
  hook. Disabled until `enable()`; every call is a no-op while disabled.
- `packages/shared/src/debug/tracePersist.ts` — wraps a persistence port to time
  stringify/read/write and feed `perfTrace`.
- `packages/shared/src/debug/bootLogger.ts` — thin compatibility shim; old
  `bootLogger.mark()` calls route to `perfTrace`.
- Native boot marks: `AppDelegate.swift` / `SceneDelegate.swift` emit
  `did-finish-launching`, `scene-will-connect`, `start-react-native` via
  `os.Logger` (+ `os_signpost` for Instruments).
- `HavenPerfLog` (`plugins/haven-perf-log-templates/HavenPerfLog.m`, installed by
  `withHavenPerfLog`) — a tiny RN module that mirrors each JS line into the iOS
  unified log via `os_log`, on the same subsystem/category as the native marks.
- The mobile entry (`apps/mobile/index.js`) enables the tracer and registers the
  native sink; the dev-tools overlay **Boot** button dumps the in-memory table.

## Reading a run

Every event is one line:

```
[haven-perf] kind=span name=bootstrap.communities elapsed=120.5 delta=40.0 duration=80.2 origin=js
[haven-perf] kind=mark name=js-entry elapsed=0.0 delta=0.0 origin=js
[haven-perf] kind=span name=did-finish-launching duration=4.6 origin=native
```

- `origin=js` vs `origin=native` tells you which side produced the line.
- `elapsed` is ms since `js-entry` (the JS t0). **Native marks are on a separate
  clock** (CFAbsoluteTime) — don't diff native timestamps against JS `elapsed`.
- `name` is the literal string in the `perfTrace.begin("…")` / `mark("…")` call —
  grep the codebase for it to find the call site.
- `kind=summary` / `summary-top` / `summary-persist` blocks are emitted at
  `auth-signed-out`, `bootstrap-ready`, `bootstrap-error`, and
  `chat-first-commit`; `summary-top` lists the slowest spans still in memory.

## Capturing

- **Console.app** (both native + JS in one stream): connect the device, filter
  subsystem `com.redrix.haven.mobile` (or type `haven-perf` and filter by
  Category). Metro also shows the JS lines.
- **Device log to a file** (needs root; `--predicate` is ignored for device
  pulls, so filter on read):
  ```
  sudo /usr/bin/log collect --device-udid <UDID> --last 30m --output /tmp/haven.logarchive
  /usr/bin/log show /tmp/haven.logarchive --predicate 'subsystem == "com.redrix.haven.mobile"' --info | grep haven-perf
  ```
  (`log` is a zsh builtin — use the absolute `/usr/bin/log`.)
- **In-app**: the dev-overlay **Boot** button prints the aggregated table; a
  Hermes debugger can call `globalThis.__havenPerf.report()`.

## Production separation

The tracer must never run in production:

- JS: `apps/mobile/index.js` only calls `enable()` / registers the sink under
  `if (__DEV__)`. In release the tracer stays disabled, so every `perfTrace.*`
  call across the app early-returns.
- Native: the `os.Logger` marks and `HavenPerfLog`'s `os_log` are wrapped in
  `#if DEBUG`, so they are compiled out of release builds.

A release build emits **zero** `haven-perf` lines. If you add instrumentation,
keep enablement dev-gated and never log PII (ids/timings only).
