# HavenCore

HavenCore is the session-scoped composition root for the Haven client. Every host (web, electron, mobile, tests) constructs one HavenCore at startup, registers it, and reads every backend, nexus, and realtime event through it. There are no parallel registries, no global singletons for migrated domains, and no per-feature Supabase subscriptions.

> Status: Totality migration in progress. Core nexuses (Social, Permissions, Profile, Voice, ViewerMessagePolicy) are registered on HavenCore. Legacy domain stores and workspace hooks are being removed.

## Onboarding rule

**UI asks the thing for the thing.** Chat UI calls `useVisibleChannel`, not SocialNexus + filters. Raw message truth lives in `useChannel`. Viewer policy is HavenCore-injected. Block/unblock syncs policy once; moderation mutates raw; visible reads heal themselves.

## Nexus registry

| Nexus | Access | Notes |
|-------|--------|-------|
| `core.communities` | `useCommunities()`, `useActiveId()`, `load()` | |
| `core.channels` | `useChannels(id)`, `useActiveChannelId()`, `ensureLoaded()` | |
| `core.messages.for(id)` | `useChannel(ch)`, **`useVisibleChannel(ch)`** | Shared `viewerMessagePolicyStore` |
| `core.directMessages` | `useConversations()`, `loadMessages()` | |
| `core.notifications` | `useInbox()`, `refreshCounts()` | |
| `core.social` | `useCounts()`, `useFriends()`, `blockUser()` | Feeds policy via `getHiddenAuthorIdsForViewer()` |
| `core.permissions` | `usePermissions(id)`, `ensureLoaded()` | Community-keyed policy buckets |
| `core.profiles` | `useProfile(userId)` | |
| `core.voice` | `useSession()`, `useVisibleParticipants(ch)` | |

## ViewerMessagePolicy

HavenCore owns `viewerMessagePolicyStore` (session-scoped, **one ref** injected into every `CommunityMessageNexus`). Call `core.syncViewerMessagePolicy(communityId?)` on:

- `bootstrapSession` after `social.load()`
- `SocialNexus.blockUser` / `unblockUser` / `SOCIAL_CHANGE`
- Permissions elevation / revoked-author load
- `uiStore.setShowHiddenMessages`
- Active community focus change

Chat reads: `core.messages.for(communityId).useVisibleChannel(channelId)` — never `useSocialStore` or `filterBlockedUserContent` in UI.

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
| **Nexus** (focus + data) | Entity map, indexes, `transform`, `load*` / `ensureLoaded`, persist/rehydrate, domain evict, stable selectors, **domain focus** (`activeId`, `activeChannelId`) | Supabase subscribe, auth, screen stack |
| **HavenCore** | Session lifecycle, `routeEvent`, cross-nexus commands (eviction, moderation), bootstrap phases, `messages.for(id)` registry | React hooks, UI state |
| **uiStore / local UI** | Modals, panels, friends panel state, workspace layout mode | Domain entities, block lists, counts, messages |
| **AppHost** | OS bridges + **imperative shell navigation** for external events (push tap, deep link, access revoked redirect) | Domain data, nexus writes |

## Where state lives

| State | Owner |
|-------|-------|
| `currentServerId` | `core.communities.activeId` |
| `currentChannelId` | `core.channels.activeChannelId` |
| Last visited channel per community | `core.channels.getLastChannelId(communityId)` (persisted on nexus) |
| Inbox panel open / friends panel tab | `uiStore` |
| Settings target / modal target | `uiStore` |
| `workspaceMode` (community vs DM layout) | Shell local state or `uiStore` |

`navigationStore`, `messagesStore`, `useCommunityWorkspace`, and `useSocialWorkspace` are **deleted**. Domain focus: `core.communities` / `core.channels`. Layout mode: `uiStore.workspaceMode`.

## Canonical UI call shape

```ts
const core = useHavenCore()
const communityId = core.communities.useActiveId()
const channelId = core.channels.useActiveChannelId()
const communities = core.communities.useCommunities()
const channels = core.channels.useChannels(communityId!)
const messages = core.messages.for(communityId!).useVisibleChannel(channelId!)
await core.channels.ensureLoaded(communityId!)
await core.messages.for(communityId!).loadTail(channelId!)
```

External navigation (notification tap, deep link, access revoked):

```ts
getAppHost().navigateToCommunity?.(serverId, channelId)
getAppHost().navigateToDm?.(conversationId)
```

## Realtime

There is exactly **one** realtime ingress: `core.routeEvent(payload)`. `core.subscribeRealtime(userId)` subscribes the user's private Supabase channel and feeds every event into `routeEvent`. Feature code never subscribes to realtime for migrated domains.

Event types currently handled by `routeRealtimeEvent`:

- `MESSAGE_INSERT` / `MESSAGE_UPDATE` / `MESSAGE_DELETE` — fan out to `CommunityMessageNexus`
- `CHANNEL_INSERT` / `CHANNEL_UPDATE` / `CHANNEL_DELETE` — apply to `ChannelNexus` (refetch when payload is partial)
- `member_channel_access_revoked` — evict from `ChannelNexus` and the message nexus
- `ROLE_CHANGE` — `core.onRoleChange(communityId)` (hydrates permissions; PermissionsNexus is post-v1)
- `NOTIFICATION` — refresh `NotificationNexus`
- `DM_CONVERSATION` / `DM_MESSAGE` — refresh `DirectMessageNexus`
- `SOCIAL_CHANGE` — `SocialNexus.handleSocialChange` + `syncViewerMessagePolicy`
- `member_banned` / `report_status_updated` — community access handlers (shell callbacks)

### Audit: backend realtime coverage

The audit below documents which backend tables/events HavenCore subscribes to via `subscribeToPrivateUserChannel`. Holes are listed in [docs/architecture/HAVEN_CORE_REALTIME_AUDIT.md](./HAVEN_CORE_REALTIME_AUDIT.md).

## Persistence

`NexusPersistence` is the platform-agnostic port every Nexus uses for persist/rehydrate. Hosts inject the adapter at `createHavenCore({ ..., persistence })` time.

| Host | Adapter |
|------|---------|
| Mobile (React Native) | `createMmkvPersistence()` |
| Web / Electron | `createMemoryPersistence()` (localStorage adapter is a follow-up) |
| Tests | `createMemoryPersistence()` |

No nexus or core module imports `react-native-mmkv` directly. Adding a new persistence backend means implementing the three-method `NexusPersistence` interface.

## Session lifecycle (Phase 1)

`bootstrapSession(userId)` and `clearSession()` drive a phase observable:

```
idle → rehydrating → loading_communities → connecting_realtime → ready
                                                                  → error
```

Splash UI subscribes via `core.useBootstrapPhase()` and shows honest labels for each phase. **Phase 1** wires this end to end and unifies the web + mobile auth bootstrap onto one path.

## Onboarding rules

1. **Reads** → Nexus selector via `useHavenCore()`. Never Zustand for domain entities.
2. **Domain focus** → `communities.activeId` / `channels.activeChannelId`. Never `navigationStore`.
3. **Screen context** → Router owns the stack/URL; on focus it syncs to the nexus. External opens go through `AppHost`.
4. **UI state** → `uiStore` or local component state only (modals, panels, workspace layout). Never in a Nexus.
5. **Writes from UI** → Nexus action method or backend for admin; never hook-local domain state.
6. **Realtime** → `core/routeRealtimeEvent.ts` is the only mutator of nexuses from events.
7. **Load** → Nexus `load*` / `ensureLoaded`; triggered by core bootstrap or navigation focus — not by screen `useEffect` fetch chains.
8. **Platform** → AppHost for OS + imperative shell nav; NexusPersistence for disk.
9. **Social** → SocialNexus holds graph/block/count data only; friends panel UI in `uiStore`.
10. **New entity type** → New Nexus + register on HavenCore + `routeEvent` cases + thin hook + tests.

## Package layout

```
packages/shared/src/
  core/
    HavenCore.ts
    havenCoreRegistry.ts
    bootstrapPhase.ts
    routeRealtimeEvent.ts
    backends.ts
    commands/
      applyAccessRevoked.ts
      applyModerationEvent.ts
    persistence/
      NexusPersistence.ts
      createMmkvPersistence.ts
      createMemoryPersistence.ts
  nexus/
    Nexus.ts
    community/
      CommunityNexus.ts
      ChannelNexus.ts
      CommunityMessageNexus.ts
  lib/backend/        # HTTP/RPC clients only
  infrastructure/platform/appHost.ts   # OS + navigateToCommunity / navigateToDm
  features/*/hooks/   # thin nexus readers + action wrappers
  stores/uiStore.ts   # modals, panels, workspaceMode — UI only
docs/architecture/HAVEN_CORE.md
```

## What HavenCore is not

- Not a React hook or context. Hosts construct it imperatively at startup.
- Not a network layer. Backends are the only network surface.
- Not a router. Routes live in the shell; HavenCore only knows domain focus.
- Not a UI store. `uiStore` owns ephemeral UI; HavenCore owns domain.

## v1 API surface (frozen)

```ts
class HavenCore {
  readonly backends: HavenBackends            // HTTP/RPC clients (read-only)
  readonly persistence: NexusPersistence
  readonly communities: CommunityNexus
  readonly channels: ChannelNexus
  readonly messages: MessageNexusRegistry     // .for(communityId) → CommunityMessageNexus
  readonly directMessages: DirectMessageNexus
  readonly notifications: NotificationNexus

  bootstrapSession(userId): Promise<void>     // idempotent
  clearSession(): Promise<void>
  routeEvent(evt): void
  subscribeRealtime(userId): () => void
  getBootstrapPhase(): BootstrapPhaseSnapshot
  subscribeBootstrapPhase(listener): () => void
  addMessageSyncListener(listener): () => void
  emitMessageSync(event): void
}
```

`requireHavenCore()` / `useHavenCore()` / `useBootstrapPhase()` are the only registry surfaces. The shape above is now frozen for v1; additive changes are allowed, breaking changes need a v2 plan.

## Status by phase

- **Phase 0** — Core shell, persistence port, `routeEvent`, registry, doc skeleton, foundation tests. ✓
- **Phase 1** — Session lifecycle, navigation contract, AppHost shell bridge, unified AuthContext, `navigationStore` deprecated. ✓
- **Phase 2** — Communities + channels via nexus reads; `useCommunityWorkspace` reduced to a delegator; `serversStore` mirrored from nexus. ✓
- **Phase 3** — Community messages via nexus; `useMessages` god-hook reduced to a thin reader; per-channel Supabase subs removed; single realtime path. ✓
- **Phase 4** — `DirectMessageNexus` and `NotificationNexus` introduced; `routeEvent` refreshes them on DM/notification events. ✓
- **Phase 5** — Runtime + bootstrap + `HavenEventBus` shims deleted; duplicate `@shared/src/app/` deleted; ESLint boundary rules added. ✓
- **Phase 6** — Finality gate, v1 surface frozen. ✓

## Known follow-ups (post-v1)

- Web-client chat-app orchestration still wraps the new nexuses behind a 900-line `useChatAppOrchestration` glue layer. The nexuses are the source of truth; the orchestration is a UI artifact that will be unwound screen-by-screen in a follow-up.
- `messagesStore` and `serversStore` are still written-through by their hooks for legacy readers. They contain no domain data the nexuses don't already own; deletion is a mechanical follow-up.
- `SocialNexus` is post-v1; the social store still drives the friends panel.

## See also

- [HavenCore Finality Plan](.cursor/plans/havencore_finality_plan_50cacd2b.plan.md) — the parent implementation plan.
