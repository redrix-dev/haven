# Platform Injection Cutover Ruleset

Timestamp: 2026-05-23 15:10:43 EDT

This is a current working refactor guide. Its purpose is to keep the web/electron/mobile cutover aligned with the HavenCore -> Nexus -> UI Consumer pattern while preserving the platform injection that still belongs at the host boundary.

## Current Finding

Platform injection still exists. That is intentional.

The migration did not remove platform injection; it narrowed what platform injection is allowed to mean:

- Platform injection provides host capabilities.
- `NexusPersistence` provides storage.
- HavenCore/Core commands and Nexus selectors own domain state and domain writes.
- UI consumes Core/Nexus directly.

The target is not "no injection." The target is "no domain behavior hidden inside platform bridges, controller hooks, or backend imports in UI."

## Current Host Shape

Each host composes the runtime at startup:

- Web:
  - `apps/web/src/index.tsx`
  - Calls `registerWebAppHost()`.
  - Creates the Supabase client.
  - Calls `createHavenCore(...)`.
  - Uses `createMemoryPersistence()`.
- Electron renderer:
  - `apps/electron/src/renderer/index.tsx`
  - Calls `registerElectronAppHost()`.
  - Creates the Supabase client.
  - Calls `createHavenCore(...)`.
  - Uses `createMemoryPersistence()`.
- Mobile:
  - `apps/mobile/App.tsx`
  - Calls `registerMobileAppHost()`.
  - Creates the mobile Supabase client.
  - Calls `createHavenCore(...)`.
  - Uses `createMmkvPersistence()`.

Shared composition pieces:

- `packages/shared/src/core/havenCoreRegistry.ts`
  - Owns `createHavenCore`, `registerHavenCore`, `requireHavenCore`, and `resetHavenCore`.
- `packages/shared/src/infrastructure/platform/appHost.ts`
  - Owns the platform capability port.
- `packages/shared/src/core/persistence/NexusPersistence.ts`
  - Owns the storage port every Nexus uses.

## Direction

The rule:

**Platform injection is for host capabilities. HavenCore/Nexus is for domain state. UI consumes HavenCore/Nexus directly.**

That gives us three clean boundaries:

- `AppHost`: OS, shell, and host capabilities.
- `NexusPersistence`: disk/local storage.
- `HavenCore` + Nexus: domain data, focus, orchestration, mutations, and realtime application.

## Ruleset

### 1. Host Entrypoints Compose The World

Only app entrypoints should:

- Register the platform host.
- Create the Supabase client.
- Choose persistence.
- Call `createHavenCore(...)`.

Normal screens, feature components, and domain hooks should not create clients, register hosts, or construct persistence.

### 2. AppHost Is OS And Shell Only

Allowed in `AppHost`:

- open external URL
- save file / desktop download
- desktop settings bridge
- desktop auth protocol URL bridge
- voice popout bridge
- window chrome controls
- browser runtime visibility/location/storage helpers
- imperative shell navigation for external events, such as deep links, push taps, and access-revoked redirects

Not allowed in `AppHost`:

- communities
- channels
- messages
- notifications
- direct messages
- friends/social graph
- profiles
- moderation/report entities
- backend RPC/table wrappers
- domain caches

### 3. Persistence Injection Is Separate

`NexusPersistence` remains the storage abstraction.

Allowed:

- Mobile injects MMKV persistence.
- Web/Electron inject memory persistence today.
- Web/Electron may later inject a localStorage-backed persistence adapter.

Not allowed:

- Nexus modules importing platform storage directly.
- UI importing persistence adapters.
- Platform storage helpers becoming domain stores.

### 4. UI Reads Domain State From Nexus Selectors

Canonical shape:

```ts
const core = useHavenCore();
const communityId = core.communities.useActiveId();
const channels = core.channels.useChannels(communityId);
const profile = core.profiles.useViewerProfile(userId);
```

Avoid wrapper hooks that only rename or repackage Nexus selectors into `state`, `derived`, and `actions`.

### 5. UI Writes Through Core/Nexus Commands

Canonical shape:

```ts
await core.notifications.markRead(notificationId);
await core.social.acceptFriendRequest(requestId);
await core.updateUserProfile(input);
```

If the command does not exist, add it to the appropriate Core/Nexus surface. Do not add a mobile/web/electron controller hook just to hide a backend call.

### 6. Lifecycle Hooks Are Adapters Only

Hooks are still allowed when they bind to real lifecycle or platform behavior:

- auth bootstrap
- deep links
- push registration and push tap listeners
- desktop settings
- voice lifecycle
- media picker and file preparation
- native app state/focus listeners

But the hook should end domain writes at Core/Nexus:

```ts
await core.notifications.upsertExpoPushSubscription(input);
```

It should not write domain data through direct backend factories, Supabase RPCs, or ad hoc stores.

### 7. Electron Main And Preload Are Host Boundary

Electron main/preload may know native IPC and operating-system details.

Electron renderer should behave like web UI:

- Use `AppHost` for desktop capabilities.
- Use `HavenCore` for domain state and mutations.
- Do not import Electron desktop clients directly from feature/domain UI.

### 8. `core.backends` Is Private-In-Practice

`core.backends` still exists because Core/Nexus/backend composition currently needs it.

Consumer code should not use it.

Allowed:

- Core internals.
- Nexus construction.
- Backend contract tests.
- Explicit temporary migration exceptions.

Not allowed:

- Web/mobile/electron UI calling `requireHavenCore().backends.*`.
- Feature hooks using `core.backends` as a shortcut around a missing Nexus command.

The comment in `packages/shared/src/core/backends.ts` that says consumers should normally read through `requireHavenCore().backends.*` is stale for the target pattern and should be updated during the web/electron cutover.

### 9. Auth Is A Bounded Exception

Auth/bootstrap can touch Supabase because it creates or restores the session Core depends on.

Current exception:

- `packages/shared/src/contexts/AuthContext.tsx` uses `requireHavenCore().backends.client`.

This is acceptable as a temporary bootstrap exception, but it should not justify backend access in normal domain screens. A later cleanup can introduce a small `core.auth` or host auth surface if we want auth to stop reaching through raw backends too.

### 10. Enforcement Should Track The Boundary

The eslint consumer boundary should continue pushing toward:

- No backend factory imports in UI/feature consumers.
- No Supabase client construction outside host/bootstrap.
- No `@shared/nexus/*` class imports in consumers.
- No persistence adapter imports in consumers.
- No domain realtime subscriptions outside HavenCore.
- No new files added to quarantine unless they are explicitly time-boxed migration debt.

## Anti-Patterns To Avoid

- A controller hook that exists only to combine Nexus selectors and return `state/derived/actions`.
- A provider/context that simply forwards Core/Nexus state.
- A platform bridge that includes domain data or backend RPC methods.
- A UI component importing a backend factory because Core/Nexus is missing a command.
- A lifecycle hook that both listens to platform events and owns domain cache state.
- A web/electron-specific workaround that bypasses Nexus because the mobile pattern already works.
- Re-creating domain focus in router state when `core.communities` and `core.channels` already own it.

## Working Cutover Test

For any migrated screen or feature, these should be true:

- The host entrypoint creates Core.
- The screen gets domain state from `useHavenCore()`.
- Mutations call Core/Nexus commands.
- Platform behavior goes through `AppHost` or a lifecycle adapter.
- Local component state is only temporary UI state.
- No direct backend factories, Supabase clients, persistence adapters, or Nexus classes are imported.

If all of those are true, the surface is aligned with the intended pattern.
