# Application Bootstrap & Initialization

How Haven starts, on every surface, from process launch to a live session.

This is the agent-facing companion to the visual boot map. If code and this
doc disagree, the code wins and this doc is fixed in the same change
(`AGENTS.md`). See also [HAVEN_CORE.md](./HAVEN_CORE.md) (composition-root
contract) and [REALTIME.md](./REALTIME.md) (event coverage).

---

## The shape in one paragraph

Haven starts from **three entry points** (`tauri` / `web` / `mobile`) into
**one shared composition root**, `HavenCore`
([`packages/shared/src/core/havenCore.ts`](../../packages/shared/src/core/havenCore.ts)).
Each platform subclasses it only to supply its parts: **`HavenSolidCore`**
(desktop + web) and **`HavenReactCore`** (mobile) each contribute a
`createParts()` that builds that framework's nexus bindings and session stores.
Construction, `bootstrapSession`, `clearSession`, realtime routing and the
`BootstrapPhase` machine are written once and run identically everywhere.

Each host entrypoint **composes the world** once — build the Supabase client,
materialize the persistence adapter, construct the core — and construction
touches **neither network nor disk** (on desktop the one disk read happens in an
awaited step _before_ construction; see Phase −1). Then **auth presence is the
trigger**: when Supabase reports a signed-in user, the host calls
`core.bootstrapSession(userId)`, which drives the phase machine that rehydrates
caches from the in-memory persistence snapshot (instant), loads the session over
HTTP, and finally opens **exactly one realtime channel**. Signing out calls
`clearSession()` and the machine returns to `idle` — but the core instance is
**never destroyed** (see Lifecycle).

```
idle → rehydrating → loading_communities → loading_session_data → connecting_realtime → ready
                                   │                    │                    │
                                   └──────────── any throw ─────────────────┴──────────→ error
```

---

## Surfaces & entrypoints

| Surface               | Entry file                                                 | Core factory                                    | Supabase client       | Persistence adapter                                        | Native bridge                       |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------- | --------------------- | ---------------------------------------------------------- | ----------------------------------- |
| **Desktop (Tauri)**   | [`apps/tauri/src/main.tsx`](../../apps/tauri/src/main.tsx) | `createTauriHavenCore` → `createSolidHavenCore` | `getTauriSupabase()`  | `createTauriPersistence()` (tauri-plugin-store, **async**) | `tauriBridge`                       |
| **Web (Vite/Vercel)** | [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx)     | `createWebHavenCore` → `createSolidHavenCore`   | `getWebSupabase()`    | `createLocalStoragePersistence()`                          | none (portable browser mode)        |
| **Mobile (RN/Expo)**  | [`apps/mobile/App.tsx`](../../apps/mobile/App.tsx)         | `createReactHavenCore` → `new HavenReactCore`   | `getMobileSupabase()` | `createMmkvPersistence()`                                  | `registerMobileAppHost()` (AppHost) |
| Tests                 | —                                                          | `createTestHavenCore()` (shared core tests)     | stub                  | `createMemoryPersistence()`                                | —                                   |

Desktop and web run the **same** Solid client (`packages/solid-client`) and the
**same** `HavenSolidCore`; they differ only in the three shell choices above.

---

## Phase −1 — persistence is materialized (desktop only)

The `NexusPersistence` port is **synchronous** (`getString` / `set` / `remove`,
no promises), because `rehydrate()` must read without `await` to paint the
last-known state instantly. Mobile (MMKV) and web (localStorage) are natively
synchronous, so their adapters are built synchronously and there is no Phase −1.

Desktop's tauri-plugin-store is **async**, so
[`createTauriPluginStorePersistence`](../../apps/tauri/src/lib/createTauriPluginStorePersistence.ts)
does its one disk read **up front** — `await store.init()`, `await
store.entries()`, load every key into an in-memory `Map` — then returns a
synchronous adapter backed by that Map (writes fire-and-forget through to disk,
debounced). That factory is `await`ed inside `createTauriHavenCore` **before**
the core constructor runs.

So the single disk read lives here, in Phase −1; construction and `rehydrate()`
only ever read the already-materialized `Map`. This is the only reason
`createTauriHavenCore` is `async` while the web and mobile core factories are
not — "construction free of disk I/O" is accurate because the I/O moved one step
earlier.

---

## Phase 0 — the host composes the world (no session yet)

This runs once per process launch, before any user is known.

**Desktop** — `main.tsx` runs an **async** `boot()`: `await createTauriHavenCore()`
(it awaits the tauri-plugin-store persistence), stashes the core on
`window.__haven` for console debugging, removes the `.boot-splash` from
`index.html`, then `render(<App bridge={tauriBridge} />)`. A boot rejection is
caught and painted into the splash ("Haven failed to start") rather than
hanging on "Warming up the perch…".

**Web** — `main.tsx` runs a **synchronous** `boot()`: stamp `buildInfo` onto
`<html>` and the console, `createWebHavenCore()`, expose `window.__haven` +
`window.__havenBuild`, remove the splash, `render(<App />)` with **no** bridge.

**Mobile** — side effects run at **module load**, before React renders:
`bootLogger.mark("js-entry")` → `registerMobileAppHost()` → LiveKit
`registerGlobals()` → `bootstrapDataCacheDebug()` → `getMobileSupabase()` →
`createReactHavenCore({ client, publicConfig, persistence: createMmkvPersistence() })`
→ set the Expo notification handler. The `App` component then gates its **first
paint** on async theme hydration (`loadPersistedThemeId`), rendering the
provider stack `GestureHandlerRootView → SafeAreaProvider → KeyboardProvider →
RootNavigator`.

### Core construction order (shared `HavenCore` constructor)

`new HavenSolidCore(options)` / `new HavenReactCore(options)` call the shared
constructor with their platform's `createParts`. It does, in order:

1. Store the injected `persistence`.
2. **`createHavenBackends(client, publicConfig)`** ([`packages/shared/src/core/backends.ts`](../../packages/shared/src/core/backends.ts)):
   - build `messageStore` + `media` helpers from the client;
   - **`configureCommunityDataBackendRuntime({ client, edge, media, messageStore })`** —
     this flips the `communityDataBackend` module singletons from "throw if used"
     to live (see the header of
     [`communityDataBackend.ts`](../../packages/shared/src/lib/backend/communityDataBackend.ts));
   - construct the remaining backends: `controlPlane`, `directMessages`,
     `moderation`, `notifications`, `social`, `serverModmail`, `voiceToken`;
   - return the `HavenBackends` bag.
3. Build the `links` pipeline (desktop/web pass their own origins as app links).
4. **`platform.createParts(...)`** — the one platform-specific step: build the
   session stores (`authStore`, `uiStore`, `viewerMessagePolicyStore`) and
   **every nexus binding** (communities, channels, messages registry, direct
   messages, notifications, onboarding, social, permissions, feature flags,
   profiles, admin, moderation, voice), each injected its `persistence` and/or
   the backend(s) it needs, plus the voice realtime transport. **Caches are
   empty — no I/O happens here.**
5. `messages.setBackends(backends)`; wire the policy-sync callbacks (`social`
   and `permissions` call back into `syncViewerMessagePolicy`) and the
   communities nexus's membership-lost callback (access loss, see
   [HAVEN_CORE.md](./HAVEN_CORE.md#access-loss)).

Backends reach code only by injection (`core.backends` and the nexuses); there
is no global backend registry.

At the end of Phase 0 the core exists, is registered
(`requireHavenSolidCore()` / `requireHavenCore()`), and is on `window.__haven`
— but it has made **zero** network or disk calls.

---

## Phase 1 — auth resolves (the trigger)

The auth boundary is the one place allowed to touch Supabase directly, because
it creates the session the core depends on.

- **Solid:** [`SessionProvider`](../../packages/solid-client/src/contexts/SessionProvider.tsx)
- **Mobile:** [`useAuthSession`](../../apps/mobile/src/hooks/useAuthSession.ts)

Both do the same thing:

1. `supabase.auth.getSession()` once, then subscribe to
   `supabase.auth.onAuthStateChange`.
2. **Dedup per user id.** Supabase fires `getSession` + `INITIAL_SESSION` +
   `SIGNED_IN` for the same user; an `activeUserId` guard ensures
   `bootstrapSession` runs **once** per distinct user.
3. `userId` present → `core.bootstrapSession(userId)`; `userId` null →
   `core.clearSession()`. Either way, `core.links.setSession(userId)` so queued
   links wait for the session.
4. **Account switch** (prev id ≠ next id) → `clearSession()` then
   `bootstrapSession(next)`.
5. `PASSWORD_RECOVERY` raises a gate that pins the app on a set-new-password
   screen until the new password is committed.

**Shell gating** (what the user sees) keys off **session presence**, not the
phase:

- `session === undefined` → splash / spinner (hydrating from storage).
- `session === null` → `SignInScreen` / auth stack.
- `session` present → the authenticated app, itself gated on the **onboarding**
  load (Solid `routes/index.tsx`), while `bootstrapSession`'s phases run
  underneath.

The `phase` observable is mirrored into UI state and logged
(`[session] phase → …`); it drives fine-grained boot UI, while the coarse
auth/app switch is driven by `session`.

---

## Phase 2 — `bootstrapSession(userId)`

`HavenCore.bootstrapSession`
([core](../../packages/shared/src/core/havenCore.ts)) is one implementation for
every surface, driving the shared
[`BootstrapPhase`](../../packages/shared/src/core/bootstrapPhase.ts) and
emitting `bootLogger` marks. Each step sets the phase first, then does the
work:

| Phase                  | Work                                                                                                                                                                                                                                                                                                   | Sync/async                     | Waits on                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `rehydrating`          | `communities.rehydrate()` + `loadDisplayOrder`, `channels`/`directMessages`/`notifications` `.rehydrate()`                                                                                                                                                                                             | **synchronous** disk reads     | nothing — paints last-known state instantly, no `await`                                   |
| `loading_communities`  | `await communities.load(userId)` (HTTP; a failure is logged and the rehydrated list kept; a community missing from the fresh list is handled as **access loss**); prune permissions for communities no longer joined; `Promise.allSettled` `ensureCommunityPermissions(id)` for every joined community | async, permissions in parallel | communities load must finish first (permissions + policy need the joined ids / active id) |
| `loading_session_data` | `Promise.allSettled([ profiles.ensureViewerProfile, profiles.ensurePlatformStaff, featureFlags.load, directMessages.ensureConversationsLoaded, notifications.ensureInbox, notifications.ensurePreferences, social.ensureLoaded ])`; then `syncViewerMessagePolicy(activeCommunityId)`                  | async, **all in parallel**     | these loads are mutually independent                                                      |
| `connecting_realtime`  | `subscribeRealtime(userId)` → `controlPlane.subscribeToPrivateUserChannel(userId)` → one `private_user:{userId}` channel → `routeEvent`                                                                                                                                                                | sync subscribe                 | caches must already exist so arriving events land somewhere                               |
| `ready`                | session live                                                                                                                                                                                                                                                                                           | —                              | —                                                                                         |
| `error`                | an unexpected throw sets `phase = "error"` with the message and re-throws (failed loads don't reach here; they are logged and skipped)                                                                                                                                                                 | —                              | —                                                                                         |

**What waits for what, in plain terms:**

- Rehydrate runs first and **does not await** — the UI paints the last-known
  communities/channels/DMs immediately while the network catches up.
- Communities **must** load before permissions and before the session-data
  policy sync, because those need the joined community ids and the active id.
- Everything after communities uses **`Promise.allSettled`**, so a single failing
  domain (e.g. notifications) **never aborts** the boot — it degrades. Check the
  per-domain `console.warn` lines, not a single top-level failure.
- Realtime subscribes **last**, so every cache exists before the first event
  can mutate it.

---

## Data: arriving, then refreshing

**Arriving** happens in two waves per domain: `rehydrate()` (synchronous disk
read, instant) then `load*()` / `ensure*()` (HTTP). `ensureX` is **load-once /
idempotent** (skips if already loaded); `load` forces a refresh.

**Refreshing** is realtime-first. There is **exactly one** domain realtime
subscription per user: `private_user:{userId}` → `routeEvent` →
`routeRealtimeEvent` ([shared](../../packages/shared/src/core/routeRealtimeEvent.ts)),
which does **one** of: **patch** a row the cache owns, **evict** a slice
(optionally lazy-reload), or **reload one domain**. Feature code must not open
its own `postgres_changes` listeners. The full event→action matrix lives in
[REALTIME.md](./REALTIME.md). Beyond realtime, refresh also comes from
**focus-driven loads** on navigation (`channels.ensureLoaded`,
`prepareTextChannelMessages`) and from the `syncViewerMessagePolicy`
recompute (triggered by social changes, permission/elevation changes, role
changes, access loss, and active community focus).

**Voice exception:** room-scoped `voice:presence:{communityId}:{channelId}`
channels are allowed for WebRTC signaling and in-call presence only.

---

## Lifecycle, ownership & teardown

**Ownership.** The core is a module-level singleton held in a ref
([`havenCoreRef`](../../apps/mobile/src/data/core/havenCoreRef.ts) /
`havenSolidRef`) that the host's `createXHavenCore` sets once at boot. There is
**one instance per process**, reached everywhere via `requireHavenCore()` /
`requireHavenSolidCore()`.

**Nobody destroys it in production.** `resetHavenCore` / `resetHavenSolidCore`
null the ref, but both are **test-only** — no runtime caller. The real model is
**create-once, clear-many, destroy-never**:

- **Logout / account switch** → `clearSession()`: unsubscribe realtime, clear
  every nexus (~14), reset the UI + viewer-policy stores, drop undelivered
  access-loss notices, `phase = "idle"`. The instance and its backends survive.
  A switch is `clearSession()` → `bootstrapSession(next)`; `subscribeRealtime`
  tears down the old channel before opening the new one. Clearing a nexus marks
  its in-flight loads **stale** (`LoadGate`), so a load that answers after
  sign-out skips its writes instead of leaking the old account's data into the
  new session. **This path is coherent.**
- **Reconnect** is handled at the channel layer, not by re-bootstrapping.
  `subscribeToPrivateUserChannel` keeps an `onAuthStateChange` listener that calls
  `realtime.setAuth` on `TOKEN_REFRESHED` / `SIGNED_IN` (keeping the private
  channel authorized across a token refresh), and on `CHANNEL_ERROR` /
  `TIMED_OUT` it only **logs** — it relies on Supabase's own socket reconnect.
  **There is no catch-up fetch after a reconnect**, so events missed while
  offline are missed, and state can silently drift until the next focus-driven
  load or domain reload.

**Two paths are not handled at all** — this is where the lifecycle is less
coherent than the boot sequence:

- **`clearSession` is a hand-written, exhaustive reset** — ~14 nexuses + 2 stores
  - policy, cleared one by one in `HavenCore.clearSession` (one place for every
    platform now) and maintained alongside `HavenParts`. There is no single
    `dispose()`; add a nexus and forget a clear line and state bleeds across
    accounts.
- **Hot-reload is unhandled.** Nothing registers `import.meta.hot` / Fast Refresh
  teardown. On HMR the module re-runs, a new core overwrites the ref, and the old
  core's realtime channel, auth listener and phase listeners are never cleaned
  up → orphaned subscriptions leak in dev until a full reload.

The auth boundary owns ending the Supabase session itself; `clearSession` is the
domain-cleanup handoff it calls.

---

## Per-surface differences at a glance

| Concern              | Desktop (Tauri)                                                                    | Web                              | Mobile                                                       |
| -------------------- | ---------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Core built           | in `await boot()` **before** `render`                                              | in sync `boot()` before `render` | at **module load**, before React renders                     |
| First-paint splash   | `index.html` `.boot-splash` ("Warming up the perch…"), removed after core + render | same, minus the `await`          | native splash → `ActivityIndicator` until `session` hydrates |
| Persistence          | tauri-plugin-store (async to build)                                                | `localStorage`                   | MMKV                                                         |
| Bridge               | `tauriBridge` injected                                                             | none (portable mode)             | `AppHost` via `registerMobileAppHost()`                      |
| Boot instrumentation | —                                                                                  | `buildInfo` stamp                | `bootLogger` marks (`js-entry` … `bootstrap-ready`)          |
| Theme gate           | in-app                                                                             | in-app                           | blocks first paint on `loadPersistedThemeId`                 |

---

## Key files

| File                                                                                                                                       | Role                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `apps/{tauri,web}/src/main.tsx`, `apps/mobile/App.tsx`                                                                                     | host entrypoints — compose the world                                                              |
| `apps/tauri/src/bootstrap/createTauriHavenCore.ts`, `apps/web/src/createWebHavenCore.ts`, `apps/mobile/src/data/core/havenCoreRegistry.ts` | per-surface core factories (client + persistence choices)                                         |
| `packages/shared/src/core/havenCore.ts`                                                                                                    | the shared composition root (construction + `bootstrapSession` + `clearSession` + realtime)       |
| `packages/solid-client/src/core/HavenSolidCore.ts`, `apps/mobile/src/data/core/HavenReactCore.ts`                                          | platform subclasses: `createParts` only                                                           |
| `packages/shared/src/core/backends.ts`                                                                                                     | `createHavenBackends` — composes every backend once; calls `configureCommunityDataBackendRuntime` |
| `packages/shared/src/core/bootstrapPhase.ts`                                                                                               | the phase observable                                                                              |
| `packages/solid-client/src/contexts/SessionProvider.tsx`, `apps/mobile/src/hooks/useAuthSession.ts`                                        | auth boundary — turns a Supabase session into `bootstrapSession` / `clearSession`                 |
| `packages/shared/src/core/routeRealtimeEvent.ts`                                                                                           | the single shared realtime mutator                                                                |

---

## Gotchas

- **The core is built before the UI renders** and parked on `window.__haven`;
  the UI only ever reads an already-constructed core via `requireHavenCore()` /
  `requireHavenSolidCore()`.
- **The core is create-once / destroy-never** — `reset*Core` is test-only, so
  logout clears state but keeps the instance. Hot-reload leaks the previous
  core's subscriptions; see Lifecycle.
- **`bootstrapSession` is idempotent per user** thanks to the `activeUserId`
  dedup in the auth boundary — but an account switch clears first.
- **`rehydrate` is synchronous and must not await** — that is what makes the
  first paint show real data instead of a spinner.
- **Failed loads degrade, they don't abort.** The communities load is caught
  and `Promise.allSettled` covers everything after it, so a failing domain still
  reaches `ready`; diagnose from per-domain `console.warn`, not a thrown error.
- **One realtime channel only** (`private_user:{userId}`); the sole exception is
  room-scoped voice presence.
- **`communityDataBackend` is inert** until `createHavenBackends` runs
  `configureCommunityDataBackendRuntime` — calling it earlier throws
  "used before initialized".
- **Shell gates on `session`, boot UI on `phase`** — they are two different
  signals; don't conflate them.
