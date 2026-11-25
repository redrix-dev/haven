---
name: haven-mobile-live-app
description: Use when changing apps/mobile React Native or Expo code, mobile data (HavenReactCore, store hooks), mobile navigation, UniWind styling, mobile native config/plugins, mobile dependencies, mobile commands, or mobile release-sensitive behavior.
---

# Haven Mobile Live App

## Read Before Editing

- [apps/mobile/README.md](../../../apps/mobile/README.md)
- [docs/architecture/COLLECTIONS.md](../../../docs/architecture/COLLECTIONS.md)
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

- Mobile constructs one `HavenReactCore` at app bootstrap
  (`apps/mobile/src/data/core/`): the shared `HavenCore` with a Zustand
  store per collection, kept as `core.stores`.
- UI reads through `useStore(name, select)` / `useCore(names, select)`
  with the collections' selectors (`@shared/collections/*/selectors`), plus
  `useMe`, `useNameOf`, `useAvatarUrl`. A selector may build a new array:
  results are compared shallowly, so it renders only when what it read
  changed (`coreSnapshot.ts`, tested in `data/__tests__/reactCore.test.ts`).
- UI writes call one core or collection command per gesture.
- An effect that opens or loads depends on ids only, never on the store state
  its command writes; read current state inside it with
  `core.stores.<name>.getState()`.
- The profile sheet and the report sheet are app-wide
  (`features/people/PeopleProvider`): `usePeople().openProfile(userId,
communityId)` and `.report(...)`.
- One chat for community channels and conversations:
  `features/community/ChannelChat`, over the shared row model
  (`@shared/features/messaging/messageViewModel`, the same one desktop
  renders).
- Feature code must not import backend factories, create Supabase clients, call
  RPC/table/channel APIs directly, import persistence adapters, or open domain
  realtime subscriptions. `core.backend` is only for a read no collection
  holds (finding a user by name, a channel's overwrites).
- The auth boundary (`useAuthSession`, `auth/mobileAuthService`) is the bounded
  auth/session exception, not a domain-data pattern.
- Incoming links (invites, destinations, auth emails) go through `core.links`,
  fed by `features/links/useMobileLinkIntake`. Never join a community from a
  link automatically; open the pre-filled join sheet.

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
- The app uses the UIScene lifecycle (iOS 27 kills apps that don't).
  `SceneDelegate` owns the window and starts React Native; `AppDelegate` only
  builds the factory. UIKit sends URLs, universal links and foreground/background
  events to the scene, so a new app-delegate hook for any of these also needs
  forwarding from `SceneDelegate`. See "UIScene lifecycle" in the mobile README.
- `prebuild` only runs `pod install` under a UTF-8 locale; otherwise run
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` in `apps/mobile/ios`.
- Test native changes on the newest iOS simulator runtime as well as an older
  one: iOS 26 only warns about some things that iOS 27 terminates the app for.
- Build local iOS from `HavenMobile.xcworkspace`, not the raw `.xcodeproj`.

## Validation

- `npm run mobile:preflight`
- `npm run mobile:typecheck`
- `npm run mobile:bundle`
- `npm run check:mobile-uniwind` for styling/theme changes
- `npm run check:mobile-typography` for text/type changes
- `npm run test:unit` for data, utility, notification, or shared behavior
- `npm run test:cleave` before merging mobile/shared work
