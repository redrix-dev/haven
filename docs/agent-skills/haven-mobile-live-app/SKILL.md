---
name: haven-mobile-live-app
description: Use when changing apps/mobile React Native or Expo code, mobile data nexuses, mobile navigation, UniWind styling, mobile native config/plugins, mobile dependencies, mobile commands, or mobile release-sensitive behavior.
---

# Haven Mobile Live App

## Read Before Editing

- [apps/mobile/README.md](../../../apps/mobile/README.md)
- [docs/architecture/HAVEN_CORE.md](../../architecture/HAVEN_CORE.md)
- [apps/mobile/docs/uniwind-mobile.md](../../../apps/mobile/docs/uniwind-mobile.md)
- Load [haven-mobile-chat-surface](../haven-mobile-chat-surface/SKILL.md) when
  touching chat list/composer/keyboard layout.

## Production Posture

The iOS app is live. Treat mobile data-layer and navigation changes as
production-sensitive, even when the user asks for a small UI tweak.

## Dependency Ownership

- Mobile owns React, React Native, Expo, mobile native modules, UniWind, and
  mobile-only native voice dependencies.
- Root owns Solid, Tauri, Vite, shared tooling, and shared domain dependencies.
- Do not add React/Expo packages to root `package.json`.
- Do not add Solid/Tauri/Vite packages to `apps/mobile/package.json`.
- Run `npm run mobile:ownership` when dependency ownership could be affected.

## Data Access

- Mobile constructs one `HavenReactCore` at app bootstrap.
- UI reads domain state through `useHavenCore()` plus selector hooks from
  `@mobile-data/hooks`.
- UI writes call one core/cache command per gesture.
- Feature code must not import backend factories, create Supabase clients, call
  RPC/table/channel APIs directly, import persistence adapters, or open domain
  realtime subscriptions.
- `AuthContext` is the bounded auth/session exception, not a domain-data pattern.

## Styling And Theme

- Prefer UniWind `className` on React Native built-ins.
- Use `*ClassName` props with `accent-*` for non-style color props such as
  `color`, `tintColor`, and `placeholderTextColor`.
- Use `ThemedIonicons` from `@/theme-rn` for semantic icon colors.
- Do not add raw hex colors or raw Tailwind palette classes unless the guard has
  an inline allow comment with a reason.
- Run `npm run check:mobile-uniwind` after styling changes.

## Native Generated Artifact Policy

- `apps/mobile/ios/` and `apps/mobile/android/` are generated and gitignored.
- Edit `app.json`, config plugins, and templates under `apps/mobile/plugins/`;
  then run `npm run mobile:native:prebuild`.
- For iOS delegate/native template work, run:
  `node tooling/scripts/mobile/revalidate-ios-delegate.mjs`
- Build local iOS from `HavenMobile.xcworkspace`, not the raw `.xcodeproj`.

## Validation

- `npm run mobile:preflight`
- `npm run mobile:typecheck`
- `npm run mobile:bundle`
- `npm run check:mobile-uniwind` for styling/theme changes
- `npm run check:mobile-typography` for text/type changes
- `npm run test:unit` for data, utility, notification, or shared behavior
- `npm run test:cleave` before merging mobile/shared work
