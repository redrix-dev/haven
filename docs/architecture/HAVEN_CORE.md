# HavenReactCore (composition root)

**HavenReactCore** is the mobile session-scoped composition root. The host constructs one
instance at startup, registers it, and routes every backend, cache, and realtime event
through it. There are no parallel registries for migrated domains and no per-feature
Supabase subscriptions.

> **Post-cleave (2026-06):** orchestration and all reactive caches live in
> `apps/mobile/src/data/`. `packages/shared` is pure logic, types, and backend clients.
> Web/electron React hosts are quarantined until rebuilt on Solid (`HavenSolidCore` — not
> started). The patterns below describe the **mobile contract**; shared routing logic is
> framework-free via `RealtimeMutationTarget`.

## Onboarding rules

**UI asks the thing for the thing.** Chat UI calls `useVisibleChannel(messageCache, channelId)`,
not SocialNexus + filters. Raw message truth lives in `useChannel`. Viewer policy is
HavenReactCore-injected. Block/unblock syncs policy once; moderation mutates raw; visible reads
heal themselves.

**HavenReactCore orchestrates; realtime mutates.** Session bootstrap, event routing,
cross-cache policy sync, and focus-driven loads live on HavenReactCore (or a single cache
command). The private-user channel is the event bus: most events are a **targeted cache patch
or evict** — not a hook fan-out that refreshes three domains after every click.

**Hooks observe React lifecycle.** Selector-hooks in `@mobile-data/hooks` bind React to cache
stores. A feature hook belongs when it exposes a *small* interface tied to
mount/focus/auth/platform (Electron settings, deep links, WebRTC). If a cache already owns the
state and actions, migrate callers to `core.*` and delete the hook. Do not add reusable hook
files that only aggregate selectors or re-fetch what realtime should already deliver.

## Cache registry

| Cache | Imperative / sync | Selector-hooks (`@mobile-data/hooks`) |
|-------|-------------------|-------------------------------------|
| `core.communities` | `load()`, `setActiveId()` | `useCommunities(core.communities)`, `useActiveCommunityId`, … |
| `core.channels` | `ensureLoaded()`, `setActiveChannelId()` | `useChannels(core.channels, id)`, `useActiveChannelId`, … |
| `core.messages.for(id)` | `loadInitial`, `sendWithMedia`, … | `useChannel(cache, ch)`, **`useVisibleChannel(cache, ch)`** |
| `core.directMessages` | `loadConversations()`, `loadMessages()` | `useDmConversations(core.directMessages)`, … |
| `core.notifications` | `loadInbox()`, `markRead()` | `useNotifications(core.notifications)`, … |
| `core.admin` | CRUD + modal state mutations | `useServerPanelState(core.admin)`, … |
| `core.social` | `blockUser()`, `load()` | `useFriends(core.social)`, `useCounts`, … |
| `core.permissions` | `ensureLoaded()` | `usePermissions(core.permissions, id)`, … |
| `core.profiles` | `loadProfile()`, … | `useProfilesRecord(core.profiles)`, `useViewerProfile`, … |
| `core.voice` | join/leave, session sync | `useVoiceSession(core.voice)`, … |

Cache classes expose `reactiveStore` + imperative methods only — **no `use*` methods on classes**.

## ViewerMessagePolicy

HavenReactCore owns `viewerMessagePolicyStore` (session-scoped, **one ref** injected into every
`CommunityMessageCache`). Call `core.syncViewerMessagePolicy(communityId?)` on:

- `bootstrapSession` after `social.load()`
- `SocialNexus.blockUser` / `unblockUser` / `SOCIAL_CHANGE`
- Permissions elevation / revoked-author load
- `uiStore.setShowHiddenMessages`
- Active community focus change

Chat reads:

```ts
const cache = core.messages.for(communityId);
const messages = useVisibleChannel(cache, channelId);
```

Never `useSocialStore` or `filterBlockedUserContent` in UI.

Policy shape (community-keyed for mod/revoked fields):

```ts
{
  hiddenAuthorIds: ReadonlySet<string>
  showHiddenMessages: boolean
  communities: Record<communityId, {
    suppressAuthorFilter: boolean
    canViewBanHidden: boolean
    revokedAuthorIdsByChannel: Record<channelId, string[]>
  }>
}
```

## The four layers

| Layer | Owns | Must NOT |
|-------|------|----------|
| **Router / shell** | Screen stack, URL (web), route params (mobile), drawer/layout | Domain entity caches, fetch, realtime |
| **Cache (Nexus)** | Entity map, indexes, `load*` / `ensureLoaded`, persist/rehydrate, domain evict, **domain focus** (`activeId`, `activeChannelId`) | Supabase subscribe, auth, screen stack, React hooks |
| **HavenReactCore** | Session lifecycle, `routeEvent`, cross-cache orchestration (policy sync, focus load, eviction), bootstrap phases, `messages.for(id)` registry | React hooks, UI state, multi-cache refresh fan-out in feature hooks |
| **uiStore / local UI** | Modals, panels, friends panel state, workspace layout mode | Domain entities, block lists, counts, messages |
| **AppHost** | OS bridges + **imperative shell navigation** for external events (push tap, deep link, access revoked redirect) | Domain data, cache writes |

## Where state lives

| State | Owner |
|-------|-------|
| `currentServerId` | `core.communities.activeId` |
| `currentChannelId` | `core.channels.activeChannelId` |
| Last visited channel per community | `core.channels.getLastChannelId(communityId)` (persisted on cache) |
| Inbox panel open / friends panel tab | `uiStore` |
| Settings target / modal target | `uiStore` |
| `workspaceMode` (community vs DM layout) | Shell local state or `uiStore` |

Domain focus: `core.communities` / `core.channels`. Layout mode: `uiStore.workspaceMode`.

## Canonical mobile UI call shape

```ts
import { useHavenCore } from "@mobile-data";
import {
  useActiveCommunityId,
  useActiveChannelId,
  useChannels,
  useVisibleChannel,
} from "@mobile-data/hooks";

const core = useHavenCore();
const communityId = useActiveCommunityId(core.communities);
const channelId = useActiveChannelId(core.channels);
const channels = useChannels(core.channels, communityId!);
const messageCache = core.messages.for(communityId!);
const messages = useVisibleChannel(messageCache, channelId!);
await core.channels.ensureLoaded(communityId!);
await core.prepareTextChannelMessages(communityId!, channelId!);
```

External navigation (notification tap, deep link, access revoked):

```ts
getAppHost().navigateToCommunity?.(serverId, channelId);
getAppHost().navigateToDm?.(conversationId);
```

## Realtime

There is exactly **one domain realtime subscription per user**:
`core.subscribeRealtime(userId)` → `private_user:{userId}` → `routeEvent`. Feature hooks and
caches must not open parallel `postgres_changes` listeners.

**Voice exception:** room-scoped `voice:presence:{communityId}:{channelId}` channels are
allowed for WebRTC signaling and in-call presence only.

### Event → cache (default shape)

Most realtime handlers should do **one** of:

- **Patch** — upsert/update a row the cache already owns (`MESSAGE_INSERT`, `PROFILE_IDENTITY_CHANGE`)
- **Evict** — drop a slice and optionally lazy-reload (`member_channel_access_revoked`, channel delete → `messages.evictChannel`)
- **Reload one domain** — `CommunityNexus.load`, `ChannelNexus.loadForCommunity`, `NotificationNexus.loadInbox`

Cross-domain work belongs in `packages/shared/src/core/routeRealtimeEvent.ts` (operates on
`RealtimeMutationTarget`) or HavenReactCore commands (`applyAccessRevoked`,
`syncViewerMessagePolicy`), not in a reusable `useX` that calls multiple caches after every
mutation.

Event types currently handled by `routeRealtimeEvent`:

- `MESSAGE_INSERT` / `MESSAGE_UPDATE` / `MESSAGE_DELETE` — fan out to `CommunityMessageCache`
- `CHANNEL_INSERT` / `CHANNEL_UPDATE` / `CHANNEL_DELETE` — apply to `ChannelNexus`
- `CHANNEL_GROUP_CHANGE` — `ChannelNexus.loadForCommunity(communityId)`
- `PROFILE_IDENTITY_CHANGE` — `ProfileNexus.upsert/remove`
- `COMMUNITY_MEMBERSHIP_CHANGE` — `CommunityNexus.load(userId)`
- `member_channel_access_revoked` — evict from `ChannelNexus` and the message cache
- `ROLE_CHANGE` — `core.onRoleChange(communityId)`
- `NOTIFICATION` — refresh `NotificationNexus`
- `DM_CONVERSATION` / `DM_MESSAGE` — refresh `DirectMessageNexus`
- `SOCIAL_CHANGE` — `SocialNexus.handleSocialChange` + `syncViewerMessagePolicy`
- `member_banned` / `report_status_updated` — community access handlers (shell callbacks)

See [HAVEN_CORE_REALTIME_AUDIT.md](./HAVEN_CORE_REALTIME_AUDIT.md) for coverage holes.

## Persistence

`NexusPersistence` is the platform-agnostic port every cache uses for persist/rehydrate. Mobile
injects the adapter at `createReactHavenCore({ ..., persistence })` time.

| Host | Adapter |
|------|---------|
| Mobile (React Native) | `createMmkvPersistence()` |
| Tests | `createMemoryPersistence()` |
| Web / Electron (future Solid) | TBD — not wired post-cleave |

No cache module imports `react-native-mmkv` directly.

## Session lifecycle

`bootstrapSession(userId)` and `clearSession()` drive a phase observable:

```
idle → rehydrating → loading_communities → connecting_realtime → ready
                                                                  → error
```

Splash UI subscribes via `core.useBootstrapPhase()` (or reads `getBootstrapPhase()`).

## Rules (reads, writes, hooks)

1. **Reads** → `@mobile-data/hooks` selector-hooks bound to cache `reactiveStore`. Never ad hoc Zustand for domain entities in UI.
2. **Domain focus** → `communities.activeId` / `channels.activeChannelId`.
3. **Screen context** → Router owns the stack/URL; on focus it syncs to the cache via `syncFocusFromRoute`.
4. **UI state** → `uiStore` or local component state only.
5. **Writes from UI** → One cache method (or backend RPC) per gesture; realtime confirms or evicts.
6. **Realtime** → `routeRealtimeEvent.ts` is the only shared mutator from events; HavenReactCore implements `RealtimeMutationTarget`.
7. **Orchestration** → Cross-cache invariants on HavenReactCore or `apps/mobile/src/data/core/commands/*`.
8. **Load** → Cache `load*` / `ensureLoaded`; text-channel focus prep via `core.prepareTextChannelMessages`.
9. **Hooks** → Lifecycle + platform only, or thin selector-hooks in `@mobile-data/hooks`.
10. **Platform** → AppHost for OS + imperative shell nav; NexusPersistence for disk.

## Enforcement

`eslint.config.mjs` gates the HavenReactCore → Cache → UI Consumer pattern for mobile.

Mobile consumer files (`apps/mobile/src/**/*`) may use `useHavenCore()` / `requireHavenCore()`
and `@mobile-data/hooks`. They may not import backend factories, construct Supabase clients,
import cache classes directly (except through core), import persistence adapters, open domain
realtime subscriptions, or call Supabase RPC/table/channel APIs directly.

Gate: `npm run test:cleave` (`lint` · `check:shared-portable` · `mobile:typecheck` ·
`mobile:bundle` · `test:unit`).

## Package layout (post-cleave)

```
packages/shared/src/
  core/
    routeRealtimeEvent.ts       # pure routing over RealtimeMutationTarget
    realtimeMutationTarget.ts
    communityChannelUtils.ts
    viewerMessagePolicy.ts      # types + equality helpers
    backends.ts                 # contracts
    persistence/NexusPersistence.ts
  nexus/                        # types + selectors only (no reactive classes)
  lib/backend/                  # HTTP/RPC + sessionBackendRegistry.ts
  infrastructure/platform/appHost.ts

apps/mobile/src/
  contexts/AuthContext.tsx
  data/
    Nexus.ts                    # entity cache base class
    core/
      HavenReactCore.ts
      havenCoreRegistry.ts      # createReactHavenCore, requireHavenCore, resetHavenCore
      bootstrapPhase.ts
      syncFocusFromRoute.ts
      commands/
    hooks/                      # standalone selector-hooks
    messages/CommunityMessageCache.ts
    communities/ … channels/ …  # entity + service caches
    session/                    # authStore, uiStore, userStatusStore
  features/voice/hooks/         # useVoice, useVoiceMemberVolumes
  debug/useDataCacheComponentProbe.ts
```

## What HavenReactCore is not

- Not a React hook or context. Mobile constructs it imperatively in `App.tsx`.
- Not in `packages/shared`. Shared exports pure routing and types only.
- Not a network layer. Backends are the only network surface.
- Not a router. Routes live in the shell; HavenReactCore only knows domain focus.
- Not a UI store. `uiStore` owns ephemeral UI; HavenReactCore owns domain orchestration.

## v1 API surface (mobile, frozen)

```ts
class HavenReactCore implements RealtimeMutationTarget {
  readonly backends: HavenBackends
  readonly persistence: NexusPersistence
  readonly communities: CommunityNexus
  readonly channels: ChannelNexus
  readonly messages: MessageNexusRegistry     // .for(communityId) → CommunityMessageCache
  readonly directMessages: DirectMessageNexus
  readonly notifications: NotificationNexus
  readonly admin: CommunityAdminNexus
  readonly social: SocialNexus
  readonly permissions: PermissionsNexus
  readonly profiles: ProfileNexus
  readonly voice: VoiceNexus

  bootstrapSession(userId): Promise<void>
  syncViewerMessagePolicy(communityId?): void
  refreshCommunities(userId): Promise<void>
  prepareTextChannelMessages(communityId, channelId): Promise<void>
  syncFocusFromRoute(...): void
  clearSession(): Promise<void>
  routeEvent(evt): void
  subscribeRealtime(userId): () => void
  // … see HavenReactCore.ts for full surface
}
```

`requireHavenCore()` / `useHavenCore()` return `HavenReactCore`. `createReactHavenCore` is the
only construction entrypoint on mobile.

## Known follow-ups

- **Solid desktop:** implement `HavenSolidCore` + native Solid caches; do not revive shared reactive layer.
- **Web/electron React:** quarantined; rebuild on Solid rather than `@mobile-data` shims.
- Close reaction/attachment/link-preview realtime holes (see realtime audit).
- Shrink remaining mobile session contexts toward landing `useEffect`s where practical.

## See also

- [HavenReactCore hook audit](./HAVEN_CORE_HOOKS_AUDIT.md)
- [Platform injection cutover](./PLATFORM_INJECTION_CUTOVER_RULESET.md)
- [Solid migration handoff](../solid-migration-handoff.md)
