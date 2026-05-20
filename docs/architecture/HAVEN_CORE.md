# HavenCore

HavenCore is the session-scoped composition root for the Haven client. Every host (web, electron, mobile, tests) constructs one HavenCore at startup, registers it, and reads every backend, nexus, and realtime event through it. There are no parallel registries, no global singletons for migrated domains, and no per-feature Supabase subscriptions.

> Status: Totality migration in progress. Core nexuses (Social, Permissions, Profile, Voice, ViewerMessagePolicy) are registered on HavenCore. Legacy domain stores and workspace hooks are being removed.

## Onboarding rules

**UI asks the thing for the thing.** Chat UI calls `useVisibleChannel`, not SocialNexus + filters. Raw message truth lives in `useChannel`. Viewer policy is HavenCore-injected. Block/unblock syncs policy once; moderation mutates raw; visible reads heal themselves.

**HavenCore orchestrates; realtime mutates.** Session bootstrap, event routing, cross-nexus policy sync, and focus-driven loads live on HavenCore (or a single nexus command). The private-user channel is the event bus: most events are a **targeted nexus patch or evict** — not a hook fan-out that refreshes three domains after every click.

**Hooks observe React lifecycle.** A hook belongs when it exposes a *small* interface tied to mount/focus/auth/platform (Electron settings, deep links, WebRTC). If a Nexus already owns the state and actions, migrate callers to `core.*` and delete the hook. Do not add reusable hook files that only aggregate nexus selectors or re-fetch what realtime should already deliver.

## Nexus registry

| Nexus | Access | Notes |
|-------|--------|-------|
| `core.communities` | `useCommunities()`, `useOrderedCommunities()`, `useActiveId()`, `load()` | Display order is host-local presentation metadata |
| `core.channels` | `useChannels(id)`, `useActiveChannelId()`, `ensureLoaded()` | |
| `core.messages.for(id)` | `useChannel(ch)`, **`useVisibleChannel(ch)`** | Shared `viewerMessagePolicyStore` |
| `core.directMessages` | `useConversations()`, `loadMessages()` | |
| `core.notifications` | `useNotifications()`, `useCounts()`, `loadInbox()` | |
| `core.admin` | `useServerPanelState()`, `useMembersModalState()`, `useChannelPermissionsState()` | Server/channel admin modal state + CRUD |
| `core.social` | `useCounts()`, `useFriends()`, `blockUser()` | Feeds policy via `getHiddenAuthorIdsForViewer()` |
| `core.permissions` | `usePermissions(id)`, `ensureLoaded()` | Community-keyed policy buckets |
| `core.profiles` | `useProfile(userId)`, `useProfilesRecord()` | |
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
| **HavenCore** | Session lifecycle, `routeEvent`, cross-nexus orchestration (policy sync, focus load, eviction), bootstrap phases, `messages.for(id)` registry | React hooks, UI state, multi-nexus refresh fan-out in feature hooks |
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
await core.prepareTextChannelMessages(communityId!, channelId!)
```

External navigation (notification tap, deep link, access revoked):

```ts
getAppHost().navigateToCommunity?.(serverId, channelId)
getAppHost().navigateToDm?.(conversationId)
```

## Realtime

There is exactly **one domain realtime subscription per user**: `core.subscribeRealtime(userId)` → `private_user:{userId}` → `routeEvent`. Feature hooks and nexuses must not open parallel `postgres_changes` listeners.

**Voice exception:** room-scoped `voice:presence:{communityId}:{channelId}` channels are allowed for WebRTC signaling and in-call presence only.

### Event → nexus (default shape)

Most realtime handlers should do **one** of:

- **Patch** — upsert/update a row the nexus already owns (`MESSAGE_INSERT`, `PROFILE_IDENTITY_CHANGE`)
- **Evict** — drop a slice and optionally lazy-reload (`member_channel_access_revoked`, channel delete → `messages.evictChannel`)
- **Reload one domain** — `CommunityNexus.load`, `ChannelNexus.loadForCommunity`, `NotificationNexus.loadInbox`

Avoid “refresh everything” handlers in UI or hooks when the event could carry (or imply) a single authoritative target. Cross-domain work belongs in `routeRealtimeEvent` or HavenCore commands (`applyAccessRevoked`, `syncViewerMessagePolicy`), not in a reusable `useX` that calls multiple nexuses after every mutation.

Event types currently handled by `routeRealtimeEvent`:

- `MESSAGE_INSERT` / `MESSAGE_UPDATE` / `MESSAGE_DELETE` — fan out to `CommunityMessageNexus`
- `CHANNEL_INSERT` / `CHANNEL_UPDATE` / `CHANNEL_DELETE` — apply to `ChannelNexus` (refetch when payload is partial)
- `CHANNEL_GROUP_CHANGE` — `ChannelNexus.loadForCommunity(communityId)`
- `PROFILE_IDENTITY_CHANGE` — `ProfileNexus.upsert/remove`
- `COMMUNITY_MEMBERSHIP_CHANGE` — `CommunityNexus.load(userId)`
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

## Rules (reads, writes, hooks)

1. **Reads** → Nexus selector via `useHavenCore()`. Never Zustand for domain entities.
2. **Domain focus** → `communities.activeId` / `channels.activeChannelId`. Never `navigationStore`.
3. **Screen context** → Router owns the stack/URL; on focus it syncs to the nexus. External opens go through `AppHost`.
4. **UI state** → `uiStore` or local component state only (modals, panels, workspace layout). Never in a Nexus.
5. **Writes from UI** → One nexus method (or backend RPC) per gesture; optimistic patch on that nexus when appropriate. Realtime confirms or evicts — do not manually refresh sibling nexuses in the handler unless HavenCore has no event yet.
6. **Realtime** → `routeRealtimeEvent.ts` is the only mutator of nexuses from events.
7. **Orchestration** → Cross-nexus invariants (`syncViewerMessagePolicy`, access revoked, session clear) on HavenCore or `core/commands/*`. Not in feature hooks.
8. **Load** → Nexus `load*` / `ensureLoaded` / `ensureInitialLoaded`; text-channel focus prep via `core.prepareTextChannelMessages` (from `syncFocusFromRoute` or landing `useEffect`) — not god-hook `useEffect` chains.
9. **Hooks** → Lifecycle + platform only. If it does not need `useEffect`/focus/auth, it is probably a nexus method or inline handler at the landing file.
10. **Reuse** → Colocate composition in the file that handles the click/focus. Extract a shared **function** (or HavenCore method) only at the second identical workflow — not a hook module “for reuse.”
11. **Platform** → AppHost for OS + imperative shell nav; NexusPersistence for disk.
12. **New entity type** → New Nexus + register on HavenCore + `routeEvent` cases + tests. Add a feature hook only if React lifecycle truly requires it.

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
      CommunityAdminNexus.ts
  lib/backend/        # HTTP/RPC clients only
  infrastructure/platform/appHost.ts   # OS + navigateToCommunity / navigateToDm
  features/*/hooks/   # shrinking allowlist — lifecycle/platform only; prefer core.*
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
  readonly admin: CommunityAdminNexus
  readonly social: SocialNexus
  readonly permissions: PermissionsNexus
  readonly profiles: ProfileNexus
  readonly voice: VoiceNexus

  bootstrapSession(userId): Promise<void>     // idempotent
  syncViewerMessagePolicy(communityId?): void
  refreshCommunities(userId): Promise<void>
  createCommunity(userId, name): Promise<{ id: string }>
  setCommunityDisplayOrder(ids): void
  resetCommunityDisplayOrder(): void
  syncActiveCommunityAccess(): void
  prepareTextChannelMessages(communityId, channelId): Promise<void>
  prepareDirectMessageConversation(conversationId, options?): Promise<void>
  syncFocusFromRoute(...): void
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
- **Phase 3** — Community messages via nexus; `useMessages` deleted; per-channel Supabase subs removed; single realtime path. ✓
- **Phase 4** — `DirectMessageNexus` and `NotificationNexus` introduced; `routeEvent` refreshes them on DM/notification events. ✓
- **Phase 5** — Runtime + bootstrap + `HavenEventBus` shims deleted; duplicate `@shared/src/app/` deleted; ESLint boundary rules added. ✓
- **Phase 6** — Finality gate, v1 surface frozen. ✓

## Known follow-ups (post-v1)

- Shrink web `useChatAppSessionState` to lifecycle/platform glue; surfaces read `core.*` directly (see **Rules** above).
- Mobile: wire settings through `core.admin` where needed.
- Close reaction/attachment/link-preview realtime holes (see realtime audit).

### Hooks (`features/*/hooks` + host glue)

Full inventory and verdicts: **[HAVEN_CORE_HOOKS_AUDIT.md](./HAVEN_CORE_HOOKS_AUDIT.md)**.

**Keep** when the hook is mostly React lifecycle or platform:

| Hook | Why it stays (for now) |
|------|-------------------------|
| `useVoiceSessionController` / `useVoice` / `useVoiceMemberVolumes` | WebRTC + media session (voice room channels are the documented realtime exception) |
| `usePlatformSession` | Auth-adjacent profile bootstrap — candidate for `ProfileNexus` |
| `useFeatureFlags` | Session flags — candidate for `PlatformNexus` |
| `useNotificationInteractions` / `useDirectMessageInteractions` | Shell navigation + toast glue — keep thin; no domain state |

**Deleted (domain hooks):** `useMessages`, `useDirectMessages`, `useNotifications`, `useServers`, `useServerOrder`, `useServerAdmin`, `useChannelManagement`, `useChannelGroups`, `useMessageNexus`, `useLiveProfiles`, `useCurrentServerPermissionUi`, `useChatAppOrchestration`; web transitional `useCommunityChannelMessaging`, `useWebDirectMessages`, `useWebNotificationSession`.

**Legacy stores deleted:** `dmStore`, `notificationsStore`, `socialStore`, `voiceStore`, `liveProfilesStore`.

**Anti-patterns:**

- Hook that re-exports nexus selectors for prop drilling → read `core.*` at the landing component.
- Hook that calls `load*` on multiple nexuses after a write → one nexus write + realtime/HavenCore command.
- New `useFoo` file created before a second call site exists → inline handler or HavenCore method first.

Web host glue (`useChatAppSessionState`, desktop settings, deep links) should shrink toward lifecycle-only; domain reads belong on nexuses at each surface.

## See also

- [HavenCore hook audit](./HAVEN_CORE_HOOKS_AUDIT.md) — post-migration hook inventory and migration queue
- [HavenCore Finality Plan](.cursor/plans/havencore_finality_plan_50cacd2b.plan.md) — the parent implementation plan.
