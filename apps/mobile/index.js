/**
 * Mobile entry. No static imports: they run before any line in this file and
 * would hide the app graph inside the time before the first mark.
 *
 * Order after the mark matches Expo's AppEntry (registerRootComponent, then App).
 * Filter device logs on `haven-perf`. A Hermes debugger can also call
 * globalThis.__havenPerf.report().
 */
const { perfTrace } = require("@shared/debug/perfTrace");

// Dev-only. In a release build `__DEV__` is false, so the tracer is never
// enabled and every perfTrace.* call across the app is a no-op (they early-
// return while disabled); the native marks are compiled out under `#if DEBUG`.
// Nothing perf-related runs in production.
if (__DEV__) {
  perfTrace.enable();
  perfTrace.installGlobalHook();

  // Mirror perf lines into the iOS unified log (Console.app) alongside the
  // native boot marks, in addition to console.log (Metro). Tag JS lines
  // origin=js so they stay distinct from the native origin=native marks. iOS
  // only; on Android the native module is absent and this no-ops. `require`
  // (not import) keeps it in the measured window, and react-native is already
  // loaded here, so the call is cheap.
  const { NativeModules } = require("react-native");
  const havenPerfLogNative = NativeModules.HavenPerfLog;
  if (havenPerfLogNative && typeof havenPerfLogNative.log === "function") {
    perfTrace.addSink((line) => havenPerfLogNative.log(`${line} origin=js`));
  }
}

perfTrace.mark("js-entry");

const registerModule = require("expo/src/launch/registerRootComponent");
const registerRootComponent = registerModule.default ?? registerModule;
perfTrace.mark("expo-entry-loaded");

const appModule = require("./App");
const App = appModule.default ?? appModule;
perfTrace.mark("app-module-evaluated");

registerRootComponent(App);
