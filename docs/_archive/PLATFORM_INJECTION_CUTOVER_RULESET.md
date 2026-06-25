# Platform Injection Cutover Ruleset

Timestamp: 2026-05-23 (rules) · updated 2026-06-08 (post-cleave)

This guide keeps host boundaries aligned with the **HavenReactCore → Cache → UI Consumer**
pattern while preserving platform injection at the host edge.

## Current finding

Platform injection still exists. That is intentional.

The true cleave narrowed what platform injection means:

- Platform injection provides **host capabilities** (`AppHost`, native bridges).
- `NexusPersistence` provides **storage**.
- **HavenReactCore** + caches own domain state, focus, orchestration, mutations, and realtime application (mobile).
- **`packages/shared`** owns pure logic, types, backend clients, and `routeRealtimeEvent` (no React).
- UI consumes Core + `@mobile-data/hooks` selector-hooks directly.

The target is not "no injection." The target is "no domain behavior hidden inside platform
bridges, controller hooks, or backend imports in UI."

> **Web/electron:** React hosts are **not** wired to HavenReactCore post-cleave. They remain
> broken/quarantined until the Solid rebuild. Rules below describe the **mobile** contract.

## Current host shape (mobile)

Mobile composes the runtime at startup:

- `apps/mobile/App.tsx`
  - Calls `registerMobileAppHost()`.
  - Creates the mobile Supabase client.
  - Calls `createReactHavenCore({ client, publicConfig, persistence })`.
  - Uses `createMmkvPersistence()`.

Shared composition pieces still in `packages/shared`:

- `packages/shared/src/infrastructure/platform/appHost.ts` — platform capability port.
- `packages/shared/src/core/persistence/NexusPersistence.ts` — storage port interface.
- `packages/shared/src/lib/backend/sessionBackendRegistry.ts` — imperative backend accessors for
  shared pure code and tests (no HavenReactCore import).

Mobile-owned composition:

- `apps/mobile/src/data/core/havenCoreRegistry.ts` — `createReactHavenCore`, `registerHavenCore`,
  `requireHavenCore`, `resetHavenCore`.
- `apps/mobile/src/data/core/HavenReactCore.ts` — session composition root.

Legacy web/electron entrypoints (`createHavenCore` in shared) are **removed**. Do not reintroduce
shared orchestration to unblock web typecheck — rebuild on Solid instead.

## Direction

**Platform injection is for host capabilities. HavenReactCore + caches are for domain state.
UI consumes Core and selector-hooks directly.**

Three clean boundaries:

- `AppHost`: OS, shell, and host capabilities.
- `NexusPersistence`: disk/local storage.
- `HavenReactCore` + caches: domain data, focus, orchestration, mutations, realtime application.

## Ruleset

### 1. Host entrypoints compose the world

Only app entrypoints should:

- Register the platform host.
- Create the Supabase client.
- Choose persistence.
- Call `createReactHavenCore(...)`.

Normal screens, feature components, and domain hooks should not create clients, register hosts,
or construct persistence.

### 2. AppHost is OS and shell only

Allowed in `AppHost`: external URLs, file save, desktop settings bridge, voice popout, window
chrome, imperative shell navigation for deep links / push taps / access-revoked redirects.

Not allowed: communities, channels, messages, notifications, DMs, social graph, profiles,
moderation entities, backend RPC wrappers, domain caches.

### 3. Persistence injection is separate

`NexusPersistence` remains the storage abstraction. Mobile injects MMKV; tests inject memory.

Not allowed: cache modules importing platform storage directly; UI importing persistence adapters.

### 4. UI reads domain state from selector-hooks

Canonical mobile shape:

```ts
import { useHavenCore } from "@mobile-data";
import { useActiveCommunityId, useChannels } from "@mobile-data/hooks";

const core = useHavenCore();
const communityId = useActiveCommunityId(core.communities);
const channels = useChannels(core.channels, communityId!);
```

Avoid wrapper hooks that only rename selector-hooks into `state` / `derived` / `actions`.
Avoid calling `core.communities.useCommunities()` — **`use*` methods on cache classes are removed**.

### 5. UI writes through Core/cache commands

```ts
await core.notifications.markRead(notificationId);
await core.social.acceptFriendRequest(requestId);
await core.profiles.updateUserProfile(input);
```

If the command does not exist, add it to the appropriate Core/cache surface.

### 6. Lifecycle hooks are adapters only

Hooks are allowed for auth bootstrap, deep links, push registration, desktop settings, voice
lifecycle, media picker, native focus listeners — but domain writes end at Core/cache:

```ts
await core.notifications.upsertExpoPushSubscription(input);
```

### 7. Electron main and preload are host boundary

Electron renderer should behave like web UI when rebuilt: AppHost for capabilities, Core for
domain. **Current electron renderer is quarantined** — do not patch with shared HavenCore shims.

### 8. `core.backends` is private-in-practice

Consumer code should not use `requireHavenCore().backends.*`. Core internals and cache
construction may use backends. UI/feature code adds a Core/cache command instead.

### 9. Auth is a bounded exception

Auth/bootstrap can touch Supabase because it creates or restores the session Core depends on.

Current mobile exception:

- `apps/mobile/src/contexts/AuthContext.tsx` wires Supabase → `bootstrapSession` / `clearSession`.

This is acceptable at the auth boundary only — not a pattern for domain screens.

### 10. Enforcement tracks the boundary

ESLint consumer boundary + `check:shared-portable` push toward:

- No backend factory imports in mobile UI/feature consumers.
- No Supabase client construction outside host/bootstrap.
- No direct cache class imports in consumers (use Core + hooks).
- No persistence adapter imports in consumers.
- No domain realtime subscriptions outside HavenReactCore.
- No `use*` exports under `packages/shared/src/core/**`.

Gate: `npm run test:cleave`.

## Current remaining punch list

- **Solid desktop:** wire `HavenSolidCore` — do not restore shared reactive orchestration for web/electron.
- Optionally inject community-data backend into `CommunityAdminNexus` instead of internal `getCommunityDataBackend`.
- Replace internal Core helper backend reach-throughs with explicit cache commands where tightening.
- Keep DM/platform report review out of this repo unless intentionally moved here.

## Anti-patterns to avoid

- Controller hook that only combines selector-hooks into `state/derived/actions`.
- Provider/context that forwards Core/cache state without adding lifecycle value.
- Platform bridge that includes domain data or backend RPC methods.
- UI component importing a backend factory because Core is missing a command.
- Re-creating domain focus in router state when caches already own it.
- **`core.x.useY()` on cache classes** — use `@mobile-data/hooks` instead.

## Working cutover test (mobile)

For any migrated screen or feature:

- Host entrypoint calls `createReactHavenCore`.
- Screen gets domain state from `useHavenCore()` + `@mobile-data/hooks`.
- Mutations call Core/cache commands.
- Platform behavior goes through `AppHost` or a lifecycle adapter.
- Local component state is only temporary UI state.
- No direct backend factories, Supabase clients, persistence adapters, or cache class imports.
