# Haven Mobile (Expo + dev client + NativeWind)

Native UI lives here. Shared **business** logic targets `packages/shared`; see `docs/shared-package-inventory.md` before importing.

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

Expo exposes public vars as `EXPO_PUBLIC_*`. The web app uses `SUPABASE_URL` / `SUPABASE_ANON_KEY` via bundlers; `@shared/lib/supabase` expects those today. For RN you will either map env in `app.config.js` or introduce a shared `createSupabaseClient` — see the inventory doc.

Copy `.env.example` to `.env` when you add keys (`.env` is gitignored at repo root; use `apps/mobile/.env` for local Expo).

## Phase 0 (current)

- Email/password sign-in (Supabase `signInWithPassword`), session persisted via AsyncStorage.
- Home: top bar (Haven + nav icons, cog opens account/settings stub) and 4-column community grid with **Create** / **Join** dashed tiles.
- Does not use shared `AuthContext`, `LoginScreen`, or `useServers` (avoids web-only imports).

## Development build (expo-dev-client)

This project uses **development clients**, not Expo Go.

### Canonical command matrix

- First setup:

```bash
npm run setup:mobile
```

- Daily dev (preferred from repo root):

```bash
npm run mobile:start
npm run mobile:ios:device
```

- Daily dev (inside `apps/mobile`):

```bash
npm run start
npm run ios:device
```

- When native deps/config changed:

```bash
npm run mobile:prebuild
npm run mobile:ios:device
```

- When caches/state are bad:

```bash
npm run reset:mobile
npm run mobile:start:clear
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
npm run mobile:prebuild
```

## Diagnostics and troubleshooting

Run a quick mobile health check from repo root:

```bash
npm run mobile:doctor
```

Common issues:

- **Config/plugin missing errors** (`expo-asset`, Babel plugin, etc.): run `npm run setup:mobile` then `npm run mobile:start:clear`.
- **iOS install succeeds but app will not launch on device** (invalid signature/trust): trust the developer profile on device under Settings > General > VPN & Device Management, then rerun `npm run mobile:ios:device`.
- **Wrong project context issues**: always use root wrappers (`npm run mobile:*`) or `cd apps/mobile` before running Expo commands.
