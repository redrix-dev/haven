# Haven Mobile (Expo + dev client + UniWind)

Native UI lives here. Shared **business** logic targets `packages/shared`; read [`docs/PORTABLE_SHARED.md`](../../docs/PORTABLE_SHARED.md) for composition-root rules, then `docs/shared-package-inventory.md` for a granular import audit.

## Prerequisites (macOS for iOS)

- Xcode + CocoaPods (`brew install cocoapods` or use Homebrew-managed Ruby)
- Node 20+
- Watchman recommended: `brew install watchman`

## Install

```bash
cd apps/mobile
npm ci
```

From repo root you can also use wrappers that always execute in `apps/mobile`:

```bash
npm run setup:mobile
```

## Environment (Supabase, later phases)

Expo exposes public vars as `EXPO_PUBLIC_*`. Host apps (web, Electron, mobile) read URL + anon key from their own config, build a client with `createHavenSupabaseClient`, then call `initializeHavenDataFromClient` so `@shared/lib/backend` resolves against that runtime — map keys in `app.config.js` `extra` (see `getMobileSupabase.ts`).

Copy `.env.example` to `.env` when you add keys (`.env` is gitignored at repo root; use `apps/mobile/.env` for local Expo).

## Phase 0 (current)

- Email/password sign-in (Supabase `signInWithPassword`), session persisted via AsyncStorage.
- Home: top bar (Haven + nav icons, cog opens account/settings stub) and 4-column community grid with **Create** / **Join** dashed tiles.
- Does not use shared `AuthContext` or `LoginScreen` (avoids web-only imports).

## Development build (expo-dev-client)

This project uses **development clients**, not Expo Go.

### Script naming (repo root)

| Script | What it does |
|--------|--------------|
| `mobile:dev:metro` | **JS only:** starts Metro + `expo start --dev-client`. Does **not** rebuild or reinstall the native app. |
| `mobile:dev:metro:clear` | Same as above, plus **`--clear`** (Metro / JS cache reset). |
| `mobile:run:ios:simulator` | **Native:** Xcode build + install on **iOS Simulator** (`expo run:ios`). |
| `mobile:run:ios:device` | **Native:** Xcode build + install on a **USB / paired iPhone** (`expo run:ios --device`). Use after Info.plist, entitlements, or native dep changes. |
| `mobile:run:android` | **Native:** `expo run:android`. |
| `mobile:native:prebuild` | **Regenerates** `ios/` and `android/` from Expo config (`expo prebuild`). Does **not** install an app by itself. |

Inside `apps/mobile`, the conventional Expo names (`npm start`, `npm run ios`, `npm run android`, `npm run prebuild`) map to the same commands.

EAS cloud builds go through one passthrough: `npm run mobile:eas:build -- --profile <development|preview|production> [--platform ios|android]`. You install the IPA/APK it produces.

### Canonical command matrix

- First setup:

```bash
npm run setup:mobile
```

- Daily dev (preferred from repo root): Metro, then open the dev client (already on device/simulator):

```bash
npm run mobile:dev:metro
```

- First **physical device** install or after **native** / plist changes:

```bash
npm run mobile:run:ios:device
```

- Daily dev (inside `apps/mobile`):

```bash
npm run dev:metro
npm run run:ios:device
```

- When native deps/config changed (regenerate native projects, then rebuild on device/simulator):

```bash
npm run mobile:native:prebuild
npm run mobile:run:ios:device
```

- When caches/state are bad:

```bash
npm run reset:mobile
npm run mobile:dev:metro:clear
```

### Manual commands

```bash
cd apps/mobile
npx expo start --dev-client
```

First **native** run (generates `ios/`, installs pods, opens Simulator or device):

```bash
npx expo run:ios
# Physical device (USB / paired):
npx expo run:ios --device
```

Open the **development build** on the phone/simulator, then connect to the Metro session started above.

Clear caches after config changes:

```bash
npx expo start --dev-client --clear
```

## EAS (optional)

`eas.json` includes a `development` profile for cloud dev-client builds when you add an Expo account and `eas project:init`.

## Typecheck

```bash
npm run typecheck
```

## Rich markdown (Software Mansion)

The text channel composer uses [`react-native-enriched-markdown`](https://github.com/software-mansion-labs/react-native-enriched-markdown) (`EnrichedMarkdownTextInput`), which **requires the New Architecture** and a **development / prebuild** build (not Expo Go). The `react-native-enriched-markdown` config plugin is listed in `app.json`. After adding or upgrading it, run `expo prebuild` and rebuild the dev client. Message bodies in the list may still use `react-native-markdown-display` until migrated to `EnrichedMarkdownText`.

**iOS pods / Reanimated / dev launcher:** The root `ios/Podfile` sets `ENV['RCT_NEW_ARCH_ENABLED']` from `ios/Podfile.properties.json`. If that file has `"newArchEnabled": "false"`, `pod install` fails inside `react-native-reanimated`’s podspec. Dev-client builds also need `"ios.buildReactNativeFromSource": "true"` because `expo-dev-launcher` links against React Native dev-support symbols such as `RCTPackagerConnection` that may be omitted from the SDK 55 prebuilt RNCore. This repo includes a small config plugin `withNewArchPodfileProperties` that forces both settings on each prebuild, and the generated `Podfile.properties.json` should keep both as `"true"`. Also **unset** any shell `RCT_NEW_ARCH_ENABLED=0` (e.g. in `~/.zshrc`) so it cannot override the build.

## Generated artifact policy

`apps/mobile/ios` and `apps/mobile/.expo` are treated as generated local artifacts in this repo and are gitignored. Regenerate native files with:

```bash
npm run mobile:native:prebuild
```

## EAS, prebuild, and the `withHavenIOSNative` plugin

- **Prebuild** (`npm run mobile:native:prebuild` or `expo prebuild`) generates `ios/` and `android/` from `app.json` and config plugins. Committed `ios`/`android` in other setups are optional; here, `ios/` is gitignored and reproduced locally or on CI.
- **EAS** commands use **`npx eas-cli`** (EAS is not a direct npm dependency) so we avoid a second copy of Expo tooling and keep `npx expo-doctor`’s “global CLI in package.json” check clean.
- **`./plugins/withHavenIOSNative`** (listed last in `app.json` `plugins`) re-applies Swift `AppDelegate`, VoIP bridge, and Xcode settings from `plugins/haven-ios-native-templates/` after prebuild. Edit the **templates**, not only the generated `ios/` copy, or your changes are lost on the next prebuild.

### dev-client crash postmortem (ordering contract)

`expo-dev-launcher` requires **`autoSetupPrepare`** to run before **`autoSetupStart`**. The prepare step happens when the **Expo React Native factory** creates the root view. An older Objective-C delegate that only called `super` never ran the factory + `startReactNative` *before* `super`, so `ExpoAppDelegate`’s subscribers (dev-launcher) ran `autoSetupStart` too early and `EXDevLauncherController` could throw. The **supported fix** (aligned with the Expo SDK 55 bare template) is: create `ExpoReactNativeFactory`, call `startReactNative` **then** `super.application(...)` (Expo SDK 55 removed the old `bindReactNativeFactory` hook), which is what the template `AppDelegate.swift` and plugin enforce.

**Build iOS** with **`HavenMobile.xcworkspace`** (CocoaPods), not the raw `.xcodeproj`, when running `xcodebuild` locally or in CI.

## Post-prebuild: verify iOS delegate + templates

From repo root:

```bash
node tooling/scripts/mobile/revalidate-ios-delegate.mjs
```

This checks that the `withHavenIOSNative` template files and expected symbols exist (and optionally that `HavenMobile.xcworkspace` builds, if the `ios` folder is present). Run it after any `expo prebuild` or when upgrading the Expo SDK.

## SDK upgrades and voice / WebRTC

Upgrade **one major SDK at a time** (`npx expo install expo@~<next> --fix` from `apps/mobile`, then `npx expo-doctor`, prebuild, pods, rebuild the dev client). Native stacks that are not part of the Expo SDK—**`react-native-webrtc`**, **`react-native-callkeep`**, **`react-native-voip-push-notification`**—may need a manual compatibility check for each new React Native or New Architecture line; re-test iOS (CallKit + PushKit) and Android after each hop. `expo.doctor` in `package.json` narrows React Native Directory noise for our chosen voice deps, but it does not replace a real device/simulator test.

To **temporarily disable** iOS CallKit + VoIP registration (e.g. during a risky native upgrade), set `EXPO_PUBLIC_HAVEN_VOIP_FOUNDATION=0` in the environment for Metro / EAS (see [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)).

## Diagnostics and troubleshooting

Use Node 24.x LTS for mobile commands. The repo includes `.nvmrc` and `.node-version` pins, and `npm run preflight` rejects other major Node versions before Expo CLI runs device tooling.

Run a quick mobile health check from repo root:

```bash
npm run mobile:doctor
```

Common issues:

- **Config/plugin missing errors** (`expo-asset`, Babel plugin, etc.): run `npm run setup:mobile` then `npm run mobile:dev:metro:clear`.
- **iOS install succeeds but app will not launch on device** (invalid signature/trust): trust the developer profile on device under Settings > General > VPN & Device Management, then rerun `npm run mobile:run:ios:device`.
- **Wrong project context issues**: always use root wrappers (`npm run mobile:*`) or `cd apps/mobile` before running Expo commands.
