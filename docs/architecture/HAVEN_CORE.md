# HavenCore (composition root)

**HavenCore** is the session's composition root, written once in
`packages/shared/src/core/havenCore.ts` and shared by every client. Each host
constructs one instance at startup, registers it, and routes every backend
call, cache, and realtime event through it. There are no parallel registries
and no per-feature Supabase subscriptions.

Platforms subclass it only to supply their parts — their binding of each
shared nexus and their session stores:

| Class            | Where                                              | Used by                 |
| ---------------- | -------------------------------------------------- | ----------------------- |
| `HavenCore`      | `packages/shared/src/core/havenCore.ts`            | — (shared logic)        |
| `HavenSolidCore` | `packages/solid-client/src/core/HavenSolidCore.ts` | desktop (Tauri) and web |
| `HavenReactCore` | `apps/mobile/src/data/core/HavenReactCore.ts`      | mobile (Expo)           |

Each subclass is a `createParts()` function plus a constructor; anything that
behaves the same on every platform lives in `HavenCore`. The bootstrap order is
mapped step by step in [BOOTSTRAP.md](./BOOTSTRAP.md).

## Nexuses: one shared class, one binding per framework

Every domain is one shared class, `XNexus`, in `packages/shared/src/nexus/<domain>/`.
It holds all the domain logic and reads/writes its state through a `StatePort`
(`get()` / `set(partial)`), so it never imports React or Solid. A platform
binding subclasses it only to build the port and expose reads:

| Binding       | Port                                   | Reads exposed                                 |
| ------------- | -------------------------------------- | --------------------------------------------- |
| `XSolidNexus` | Solid store; `set` reconciles each key | `state` (live proxy) + `createMemo` accessors |
| `XReactNexus` | vanilla zustand store                  | `reactiveStore`, read by `@mobile-data/hooks` |

Rules the port imposes on shared code:

- **Write immutably.** Build the next value (`{ ...entities, [id]: entry }`) and
  hand it to `set`. On Solid each key is `reconcile`d, so one edited message
  updates one row instead of re-running every open channel.
- **Values passed to `set` become store-owned.** Initial state comes from a
  `createInitialXState()` factory, never a shared constant.
- **Rows keyed by something other than `id`** name their key when the Solid
  port is built (voice rosters use `userId`), or a removal morphs every later
  row into its neighbour.
- **Reads can be reactive.** On Solid `get()` is the live proxy, so shared
  getters stay reactive in memos — and a shared method that reads and writes
  must be `untrack`ed inside an effect (see the `haven-solid-reactivity` skill).

Loads go through a `LoadGate` (`kit/loadGate.ts`): one in-flight load per key,
and a `stale()` check handed to each task. `clear()` marks running loads stale;
a task checks `stale()` after each `await` and skips its writes, so a load that
finishes after sign-out cannot put the previous session's data into the next.

## Onboarding rules

**UI asks the thing for the thing.** Chat UI reads visible messages from the
message nexus (`useVisibleChannel` on mobile, the nexus accessors on Solid),
not social state plus filters. Viewer policy is core-injected. Block/unblock
syncs policy once; moderation mutates raw; visible reads heal themselves.

**HavenCore orchestrates; realtime mutates.** Session bootstrap, event
routing, cross-nexus policy sync, access loss and focus-driven loads live on
HavenCore (or one nexus command). The private-user channel is the event bus:
most events are a **targeted patch or evict**, not a fan-out that refreshes
three domains after every click.

**UI reads through bindings, writes through one command.** A gesture calls one
nexus method or one core command. Do not add hooks or helpers that only
re-bundle reads or re-fetch what realtime already delivers.

## Nexus registry

| `core.*`           | Shared class                       | Typical commands                                                  |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------- |
| `communities`      | `CommunityNexus`                   | `load()`, `setActiveId()`                                         |
| `channels`         | `ChannelNexus`                     | `ensureLoaded()`, `setActiveChannelId()`, CRUD, permission editor |
| `messages.for(id)` | `CommunityMessageNexus` (registry) | `ensureInitialLoaded()`, `send…`, `edit()`                        |
| `directMessages`   | `DirectMessageNexus`               | `openConversation()`, `sendMessage()`, `markRead()`               |
| `notifications`    | `NotificationNexus`                | `loadInbox()`, `markRead()`, `dismiss()`                          |
| `social`           | `SocialNexus`                      | `ensureLoaded()`, `blockUser()`                                   |
| `permissions`      | `PermissionsNexus`                 | `ensureLoaded()`, `getPermissions()`                              |
| `profiles`         | `ProfileNexus`                     | `ensureViewerProfile()`, `updateViewerProfile()`                  |
| `admin`            | `CommunityAdminNexus`              | members, bans, roles, settings, invites per community             |
| `moderation`       | `CommunityModerationNexus`         | `load()`, report changes                                          |
| `featureFlags`     | `FeatureFlagNexus`                 | `load()`                                                          |
| `onboarding`       | `OnboardingNexus`                  | `load()`, `complete()`                                            |
| `voice`            | `VoiceNexus`                       | session phase, rosters, presence and kick channels                |

Binding classes expose reads and imperative methods only — **no `use*` methods
on classes**. Mobile reads go through `@mobile-data/hooks`; Solid reads through
the binding's accessors.

## ViewerMessagePolicy

HavenCore owns `viewerMessagePolicyStore` (session-scoped, **one store**
injected into every community message nexus). `core.syncViewerMessagePolicy(communityId?)`
runs on:

- `bootstrapSession`, after the session's data loads
- block / unblock / `SOCIAL_CHANGE` (the social nexus's policy callback)
- permissions elevation and revoked-author loads (the permissions nexus's callback)
- role changes, access loss, entering a text channel

Never filter blocked authors in UI. Policy shape (community-keyed for
mod/revoked fields):

```ts
{
  hiddenAuthorIds: ReadonlySet<string>;
  showHiddenMessages: boolean; // from uiStore; no UI toggles it today
  communities: Record<
    communityId,
    {
      suppressAuthorFilter: boolean;
      canViewBanHidden: boolean;
      revokedAuthorIdsByChannel: Record<channelId, string[]>;
    }
  >;
}
```

## The layers

| Layer                  | Owns                                                                                                                              | Must NOT                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Router / shell**     | Screen stack (mobile), URL (desktop/web), drawer and layout                                                                       | Entity caches, fetches, realtime                                    |
| **Nexus**              | Entities, indexes, `load*` / `ensureLoaded`, persist/rehydrate, evict, domain focus (`activeId`, `activeChannelId`)               | Subscriptions, auth, screen stack, framework imports (shared class) |
| **HavenCore**          | Session lifecycle, `routeEvent`, cross-nexus work (policy sync, access loss, focus loads), bootstrap phases, the message registry | Framework code, UI state                                            |
| **uiStore / local UI** | Modals, panels, friends panel, workspace layout                                                                                   | Domain entities, block lists, counts, messages                      |
| **AppHost**            | OS bridges and imperative shell navigation for external events (push tap, deep link)                                              | Domain data, nexus writes                                           |

## Where state lives

| State                                    | Owner                                                     |
| ---------------------------------------- | --------------------------------------------------------- |
| Active community                         | `core.communities` (`activeId`)                           |
| Active channel                           | `core.channels` (`activeChannelId`)                       |
| Last visited channel per community       | `core.channels.getLastChannelId(communityId)` (persisted) |
| Inbox / friends panel, settings targets  | `uiStore`                                                 |
| `workspaceMode` (community vs DM layout) | `uiStore`                                                 |

On desktop/web the URL is the source of truth for the active community and
channel: `createCommunityRouteSync` copies route params into the nexuses, and
`CommunityView` redirects when the route points at something that no longer
exists. On mobile the screen stack syncs focus via `syncFocusFromRoute`.

## Call shapes

Mobile:

```ts
const core = useHavenCore();
const communityId = useActiveCommunityId(core.communities);
const channelId = useActiveChannelId(core.channels);
const channels = useChannels(core.channels, communityId!);
const messages = useVisibleChannel(core.messages.for(communityId!), channelId!);
await core.prepareTextChannelMessages(communityId!, channelId!);
```

Desktop / web (Solid):

```ts
const core = requireHavenSolidCore();
const channels = core.channels.channels(() => params.communityId);
createEffect(() => {
  const id = params.communityId; // track ids only…
  untrack(() => void core.channels.ensureLoaded(id)); // …then call untracked
});
```

## Realtime

There is exactly **one domain realtime subscription per user**:
`core.subscribeRealtime(userId)` → `private_user:{userId}` → `routeEvent`.
Nexuses and features must not open parallel `postgres_changes` listeners.

**Voice exception:** room-scoped `voice:presence:{communityId}:{channelId}` and
`voice:kick:…` channels, owned by the voice nexus.

Most handlers do **one** of: **patch** a row the nexus owns, **evict** a slice,
or **reload one domain**. Events `routeRealtimeEvent` handles:

- `MESSAGE_INSERT` / `MESSAGE_UPDATE` / `MESSAGE_DELETE` — the community's message nexus
- `CHANNEL_INSERT` / `CHANNEL_UPDATE` / `CHANNEL_DELETE` — the channel nexus (+ evict messages on delete)
- `CHANNEL_GROUP_CHANGE` — reload that community's channels
- `PROFILE_IDENTITY_CHANGE` — profile upsert/remove
- `COMMUNITY_MEMBERSHIP_CHANGE` — reload the community list (this is how a kick,
  ban or deleted community reaches the viewer; see Access loss)
- `ROLE_CHANGE` — `core.onRoleChange`: refetch permissions **and** the channel list,
  evict messages of channels that disappeared, move off a hidden active channel.
  Sent for role assignments, role permissions, and channel overwrites.
- `NOTIFICATION` — reload the inbox, then surface the newest as a toast (desktop also plays a sound)
- `DM_CONVERSATION` / `DM_MESSAGE` — the DM nexus
- `SOCIAL_CHANGE` — social reload + policy sync
- `report_created` / `report_status_updated` / `USER_PLATFORM_BANNED` — moderation nexus

See [REALTIME.md](./REALTIME.md) for the coverage matrix and open holes.

## Access loss

When a community-list reload no longer contains a community the viewer had —
kicked, banned, or the community was deleted, including while the app was
closed — the community nexus reports it lost and HavenCore:

1. forgets it: admin data, channels, messages (memory **and** device storage),
   permissions;
2. focuses the next community if it was the active one;
3. tells the platform through `core.subscribeCommunityAccessLost(listener)` with
   `{ communityId, communityName, wasActive, inVoice }`.

A community the viewer leaves is removed locally before the reload, so it is
never reported. Each platform has **one** subscriber, which shows the notice
and leaves voice: `CommunityAccessLossHost` (Solid) and `MainNavigationShell`
(mobile, which also navigates off the screen). Losses found before anyone
subscribed — at sign-in — are held for the first subscriber.

Losing a single channel arrives as `ROLE_CHANGE` (above); the sidebar updates
and focus moves to the community's default channel.

## Persistence

`NexusPersistence` is the platform-agnostic port nexuses use to persist and
rehydrate. The host chooses the adapter:

| Host                  | Adapter                                            |
| --------------------- | -------------------------------------------------- |
| Mobile (React Native) | `createMmkvPersistence()`                          |
| Desktop (Tauri)       | `createTauriPersistence()` (localStorage fallback) |
| Web                   | `createLocalStoragePersistence()`                  |
| Tests                 | `createMemoryPersistence()`                        |

No nexus imports a storage library directly.

## Session lifecycle

`bootstrapSession(userId)` and `clearSession()` drive a phase observable:

```
idle → rehydrating → loading_communities → loading_session_data
     → connecting_realtime → ready                      (or → error)
```

A failed load is logged and skipped; only an unexpected throw ends in `error`.
UI follows it via `subscribeBootstrapPhase()` / `getBootstrapPhase()`
(`useBootstrapPhase()` on mobile).

## Rules

1. **Reads** → the platform binding (Solid accessors, mobile hooks). Never ad hoc stores for domain entities in UI.
2. **Domain focus** → `communities.activeId` / `channels.activeChannelId`.
3. **Screen context** → the router owns stack/URL and syncs focus into the nexuses.
4. **UI state** → `uiStore` or local component state only.
5. **Writes from UI** → one nexus method or core command per gesture; realtime confirms or evicts.
6. **Realtime** → `routeRealtimeEvent.ts` is the only mutator from events; HavenCore implements `RealtimeMutationTarget`.
7. **Orchestration** → anything touching two nexuses is a HavenCore method.
8. **New domain logic** → the shared nexus. A binding adds reads, never behavior.
9. **Effects (Solid)** → track ids only; call store-writing methods inside `untrack`.
10. **Platform** → AppHost for OS and shell navigation; NexusPersistence for disk.

## Host boundaries

Platform injection provides **host capabilities**, never domain behavior. Three
seams: `AppHost` (OS/shell), `NexusPersistence` (disk), HavenCore + nexuses
(domain).

1. **Host entrypoints compose the world.** Only the app entrypoint (`App.tsx`,
   `createTauriHavenCore`, `createWebHavenCore`) creates the Supabase client,
   chooses persistence, and creates the core. Screens and features never do.
2. **AppHost is OS and shell only.** External URLs, file save, settings bridges,
   window chrome, imperative navigation for push taps and deep links.
3. **Auth is a bounded exception.** The auth boundary may touch Supabase because
   it creates the session the core depends on, and calls `bootstrapSession` /
   `clearSession`.
4. **`core.backends` is private in practice.** Core internals and nexus
   construction use backends; UI adds a core or nexus command instead.

## Enforcement

`eslint.config.mjs` gates mobile consumers: they may use `useHavenCore()` /
`requireHavenCore()` and `@mobile-data/hooks`, but not backend factories,
Supabase clients, binding classes, persistence adapters, or realtime APIs.
`check:shared-portable` keeps `packages/shared` free of React and Solid.

Gate: `npm run test:cleave` (lint · portability · typecheck · mobile typecheck ·
mobile bundle · unit · tier-2).

## Testing the core

`packages/shared/src/core/__tests__/testHavenCore.ts` builds a **real**
HavenCore over the real shared nexuses on plain ports, with in-memory
persistence and stub backends a test overrides where it needs to. Use it for
anything that spans nexuses — see `havenCoreAccessLoss.test.ts`.

## Package layout

```
packages/shared/src/
  core/
    havenCore.ts               # the shared composition root
    bootstrapPhase.ts
    routeRealtimeEvent.ts      # routing over RealtimeMutationTarget
    realtimeMutationTarget.ts
    viewerMessagePolicy.ts
    backends.ts
    persistence/
  nexus/
    kit/                       # StatePort, LoadGate, error + record helpers
    <domain>/                  # XNexus, XState types, selectors
  lib/backend/                 # HTTP/RPC clients

packages/solid-client/src/
  core/HavenSolidCore.ts       # createSolidParts + subclass
  data/kit/solidStatePort.ts
  data/<domain>/xSolidNexus.ts # bindings

apps/mobile/src/data/
  core/HavenReactCore.ts       # createReactParts + subclass
  kit/zustandStatePort.ts
  <domain>/xReactNexus.ts      # bindings
  hooks/                       # selector hooks over reactiveStore
```

## What HavenCore is not

- Not a hook, context, or framework object. Hosts construct it imperatively.
- Not a network layer. Backends are the only network surface.
- Not a router. It knows domain focus, not screens or URLs.
- Not a UI store. `uiStore` owns ephemeral UI.

## See also

- [BOOTSTRAP.md](./BOOTSTRAP.md) — the start sequence, step by step
- [REALTIME.md](./REALTIME.md) — event contract and coverage matrix
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — the layer law this contract implements
