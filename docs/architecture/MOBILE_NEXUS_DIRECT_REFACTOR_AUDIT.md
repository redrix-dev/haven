# Nexus-Direct Refactor Working Audit

Timestamp: 2026-05-23 18:00:31 EDT

This is a current working refactor list, not a final architecture contract. It records what is actually left before the repo fully matches the HavenCore -> Nexus -> UI Consumer shape.

## Current Direction

The canonical application pattern is:

- UI components call `useHavenCore()`.
- Domain state is read from `core.<nexus>.use...()` selectors.
- Domain mutations call `core.<nexus>...()` or a `HavenCore` command.
- Missing domain commands are added to Core/Nexus, not to mobile/web/electron controller hooks or provider wrappers.

## Current Repo Status

The consumer-facing cutover is mostly over the line.

Clean now:

- Mobile feature, screen, and navigation consumers are clean for direct backend factories, direct `@shared/nexus/*` class imports, and `core.backends` usage.
- Web/electron feature and component consumers are clean for direct backend factories after the feature flag, profile/session, notification, DM interaction, permission hydration, voice, and moderation passes.
- Community modmail is now the in-app moderation review surface and reads/writes through Core/Nexus.
- DM report review UI was removed from this repo because platform DM review lives in the separate admin Next.js repo.
- `npm run lint`, `npm run typecheck`, `npm run mobile:typecheck`, `npm run check:shared-portable`, and `npm run test:unit` pass as of the last verification run. Lint still reports three pre-existing unused-disable warnings.

## Remaining Consumer Work

### Remove Stale Mobile Quarantine

- `apps/mobile/src/haven-rev2/**`
  - Current state: the folder no longer exists.
  - Next step: remove this stale ignore from `havenCoreConsumerBoundaryIgnores` and the mobile-specific eslint rule block that targets the deleted folder.

### Delete Deprecated Mobile Alias

- `apps/mobile/src/screens/main/CommunityScreen.tsx`
  - Current state: deprecated alias to `CommunityChatScreen`.
  - Search result: no active imports besides itself.
  - Next step: delete once comfortable with the navigation file history.

### Flatten Web Session Ergonomics

`packages/web-client/src/chat-app/useChatAppSessionState.ts` is now boundary-aligned, but still functions as a large compatibility shell that passes many values/actions to older web components.

This is no longer a backend-boundary blocker. It is remaining readability work:

- Move more web components to direct `useHavenCore()` reads when editing those surfaces.
- Keep local shell state for UI chrome, active modals, transient errors, and host lifecycle.
- Avoid introducing new controller hooks that only repackage Nexus selectors into `state/derived/actions`.

## Host And Platform Exceptions To Keep

These are acceptable exceptions, not pattern violations:

- Auth/bootstrap:
  - `packages/shared/src/contexts/AuthContext.tsx`
  - `apps/mobile/src/auth/mobileAuthService.ts`
  - host Supabase client construction
  - mobile Supabase bootstrap
- Persistence construction:
  - `apps/mobile/src/lib/createMmkvPersistence.ts`
  - `apps/mobile/src/lib/react-native-mmkv.d.ts`
  - host-provided memory persistence for web/electron
- Native/platform lifecycle:
  - Expo push token acquisition and push tap listeners
  - VoIP foundation
  - media/file picker preparation
  - desktop settings and Electron shell bridges
- UI-only stores:
  - `useUiStore`
  - push navigation store
  - chrome/bubble/sidebar stores
- Backend contract tests and backend modules.

## Internal Hardening Still Available

These are internal cleanup opportunities, not consumer blockers:

- `CommunityAdminNexus` still imports `getCommunityDataBackend` internally for community-scoped admin operations. It is acceptable today because it is Nexus-internal, but can be tightened by injecting the community-data backend through `HavenCore`.
- `HavenCore.prepareTextChannelMessages` still uses `getCommunityDataBackend(...)` internally for revoked-author hydration. This can be replaced with `this.backends.communityData`.
- Core notification sound sync uses `core.backends.notifications` internally. It can be moved behind `NotificationNexus` if we want Core helpers to avoid backend reach-through entirely.
- `packages/shared/src/lib/backend/index.ts` still exposes legacy backend factory shims for contract tests and transitional compatibility. UI/feature consumers should not import these.

## Enforcement Snapshot

`havenCoreConsumerBoundaryIgnores` should now contain only host/bootstrap or stale mobile exceptions:

- test files
- deleted mobile `haven-rev2` path until removed
- mobile auth service
- mobile MMKV persistence files
- mobile Supabase bootstrap

No active web/electron feature or component file should be in the quarantine list.

## Working Cutover Test

For any migrated screen or feature, these should be true:

- The host entrypoint creates Core.
- The screen gets domain state from `useHavenCore()`.
- Mutations call Core/Nexus commands.
- Platform behavior goes through `AppHost` or a lifecycle adapter.
- Local component state is only temporary UI state.
- No direct backend factories, Supabase clients, persistence adapters, or Nexus classes are imported by UI/feature consumers.
