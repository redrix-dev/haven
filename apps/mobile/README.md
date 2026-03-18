# Haven Mobile

Dedicated Capacitor target for native iOS and Android.

## Commands

- `npm run dev:mobile:web`
- `npm run build:mobile:web`
- `npm run mobile:sync`
- `npm run mobile:ios`
- `npm run mobile:android`

## Structure

- `src/` contains the dedicated mobile React runtime and UI.
- `android/` and `ios/` are generated Capacitor native projects.
- `capacitor.config.ts` points the native shells at the bundled mobile web assets.

## Runtime Boundary

- Shared business logic, orchestration, and backend clients remain in `packages/shared`.
- Mobile-only layout, navigation, and keyboard behavior live under `apps/mobile/src/mobile`.
- Native platform behavior is injected through `packages/shared/src/platform/runtime`.

## Current Status

- Desktop, web, and mobile are now separate build targets.
- Mobile runs as a dedicated Capacitor shell with synced native projects.
- Native keyboard state is exposed through the mobile runtime and consumed by the mobile viewport provider.

## Remaining Integration Work

- Register native push tokens against a backend installation registry.
- Extend notification fanout from browser web push to native mobile delivery.
- Publish verified association files for iOS universal links and Android app links from the web host.
