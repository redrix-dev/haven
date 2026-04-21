# Haven Mobile (Expo + dev client + NativeWind)

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
- Does not use shared `AuthContext`, `LoginScreen`, or `useServers` (avoids web-only imports).

## Development build (expo-dev-client)

This project uses **development clients**, not Expo Go.

### Script naming (repo root)

| Script | Also known as | What it does |
|--------|----------------|--------------|
| `mobile:dev:metro` | `mobile:start` | **JS only:** starts Metro + `expo start --dev-client`. Does **not** rebuild or reinstall the native app. |
| `mobile:dev:metro:clear` | `mobile:start:clear` | Same as above, plus **`--clear`** (Metro / JS cache reset). |
| `mobile:run:ios:simulator` | `mobile:ios` | **Native:** Xcode build + install on **iOS Simulator** (`expo run:ios`). |
| `mobile:run:ios:device` | `mobile:ios:device` | **Native:** Xcode build + install on a **USB / paired iPhone** (`expo run:ios --device`). Use after Info.plist, entitlements, or native dep changes. |
| `mobile:run:android` | `mobile:android` | **Native:** `expo run:android`. |
| `mobile:native:prebuild` | `mobile:prebuild` | **Regenerates** `ios/` and `android/` from Expo config (`expo prebuild`). Does **not** install an app by itself. |

EAS scripts (`mobile:eas:build:*`, etc.) are **cloud builds**; you install the IPA/APK they produce.

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

## Generated artifact policy

`apps/mobile/ios` and `apps/mobile/.expo` are treated as generated local artifacts in this repo and are gitignored. Regenerate native files with:

```bash
npm run mobile:native:prebuild
```

## Diagnostics and troubleshooting

Run a quick mobile health check from repo root:

```bash
npm run mobile:doctor
```

Common issues:

- **Config/plugin missing errors** (`expo-asset`, Babel plugin, etc.): run `npm run setup:mobile` then `npm run mobile:dev:metro:clear`.
- **iOS install succeeds but app will not launch on device** (invalid signature/trust): trust the developer profile on device under Settings > General > VPN & Device Management, then rerun `npm run mobile:run:ios:device`.
- **Wrong project context issues**: always use root wrappers (`npm run mobile:*`) or `cd apps/mobile` before running Expo commands.
