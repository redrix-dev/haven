# Mobile cache-direct refactor audit

Timestamp: 2026-05-23 (initial) · updated 2026-06-08 (post-cleave)

Working audit of the **mobile** HavenReactCore → Cache → UI Consumer shape. Web/electron are
out of scope until the Solid rebuild.

## Current direction

The canonical **mobile** pattern:

- UI calls `useHavenCore()` → `HavenReactCore`.
- Domain state is read via **`@mobile-data/hooks`** selector-hooks
  (`useFriends(core.social)`, `useVisibleChannel(messageCache, channelId)`, …).
- Domain mutations call `core.<cache>...()` or a HavenReactCore command.
- Cache classes expose `reactiveStore` + imperative methods — **no `use*` on classes**.

## Current repo status (post-cleave)

**Complete for mobile:**

- All reactive caches relocated to `apps/mobile/src/data/`.
- `HavenReactCore` + registries + orchestration in `apps/mobile/src/data/core/`.
- Standalone selector-hooks in `apps/mobile/src/data/hooks/`.
- `AuthContext`, voice hooks, debug probe relocated to `apps/mobile/src/`.
- Integration tests in `apps/mobile/src/data/__tests__/`.
- `packages/shared` is pure (`check:shared-portable`, empty exclusions).

**Gates:** `npm run test:cleave` green
(`lint` · `check:shared-portable` · `mobile:typecheck` · `mobile:bundle` · `test:unit`).

**Quarantined:** web `typecheck`, `typecheck:solid` — React desktop not maintained post-cleave.

## Remaining consumer work (mobile)

### Shrink session contexts

Some mobile providers (`MobileMainSessionContext`, DM/notifications contexts) still wrap Core
reads. Prefer landing-screen `useEffect`s + direct hook reads when editing those surfaces — same
pattern as the web DM/notifications migration (web itself is quarantined).

### Flatten admin/mobile action hooks

`useMobileServerAdminActions` and similar thin wrappers can collapse into direct `core.admin`
calls at call sites when touched.

## Host and platform exceptions to keep

Acceptable exceptions, not pattern violations:

- Auth/bootstrap:
  - `apps/mobile/src/contexts/AuthContext.tsx`
  - `apps/mobile/src/auth/mobileAuthService.ts`
  - host Supabase client construction
- Persistence:
  - `apps/mobile/src/lib/createMmkvPersistence.ts`
- Native/platform lifecycle:
  - Expo push, VoIP, media picker, theme hydration hooks
- UI-only stores:
  - `apps/mobile/src/data/session/uiStore.ts` (and related session stores)
- Backend contract tests and `packages/shared/src/lib/backend/*`.

## Internal hardening still available

Not consumer blockers:

- `CommunityAdminNexus` may still call `getCommunityDataBackend` internally — tighten via
  constructor injection through HavenReactCore if desired.
- `HavenReactCore.prepareTextChannelMessages` may reach backends for revoked-author hydration —
  can move to explicit cache command.
- `sessionBackendRegistry` in shared replaces older `requireHavenCore()` coupling for imperative
  backend access in pure code paths.

## Enforcement snapshot

Mobile consumers (`apps/mobile/src/**/*`) should stay out of:

- Direct `@shared/lib/backend/*` factory imports (except bootstrap/auth quarantine).
- Direct cache class imports in feature UI (use Core + hooks).
- `core.backends` from UI/feature code.

`havenCoreConsumerBoundaryIgnores` should list only host/bootstrap/test exceptions.

## Working cutover test

For any mobile screen or feature:

- `App.tsx` (or test setup) calls `createReactHavenCore`.
- Screen uses `useHavenCore()` + `@mobile-data/hooks`.
- Mutations call Core/cache commands.
- Platform behavior goes through `AppHost` or lifecycle adapter.
- No direct backend factories, Supabase clients, persistence adapters, or cache class imports in UI.
