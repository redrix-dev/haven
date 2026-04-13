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

## Environment (Supabase, later phases)

Expo exposes public vars as `EXPO_PUBLIC_*`. The web app uses `SUPABASE_URL` / `SUPABASE_ANON_KEY` via bundlers; `@shared/lib/supabase` expects those today. For RN you will either map env in `app.config.js` or introduce a shared `createSupabaseClient` — see the inventory doc.

Copy `.env.example` to `.env` when you add keys (`.env` is gitignored at repo root; use `apps/mobile/.env` for local Expo).

## Phase 0 (current)

- Email/password sign-in (Supabase `signInWithPassword`), session persisted via AsyncStorage.
- Home: top bar (Haven + nav icons, cog opens account/settings stub) and 4-column community grid with **Create** / **Join** dashed tiles.
- Does not use shared `AuthContext`, `LoginScreen`, or `useServers` (avoids web-only imports).

## Development build (expo-dev-client)

This project uses **development clients**, not Expo Go.

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
