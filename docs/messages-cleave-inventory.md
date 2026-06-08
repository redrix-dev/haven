# Messages domain cleave inventory (Phase 0)

> Analysis artifact for [The Cleave](solid-migration-handoff.md) §8. Sorted against §0.4:
> *"Is this logic, or is this a cache?"*

**Status:** complete (Phases 5–6 landed). Checklist below reflects cleave-complete state.

---

## Surface area

| File | LOC | Layer | Disposition |
|------|-----|-------|-------------|
| `packages/shared/src/nexus/community/CommunityMessageNexus.ts` | 1009 | Mixed | **CACHE** → `apps/mobile/src/data/messages/`; extract logic first |
| `packages/shared/src/nexus/community/projectVisibleChannelMessages.ts` | 121 | Logic | **KEEP** in shared |
| `packages/shared/src/core/viewerMessagePolicy.ts` | 83 | Mixed | Types + equality → **KEEP**; zustand factory → **CACHE** → mobile |
| `packages/shared/src/core/routeRealtimeEvent.ts` (MESSAGE_*) | ~110 | Mixed | Partial-row shaping → **KEEP**; nexus calls → cache port |
| `packages/shared/src/core/HavenCore.ts` `MessageNexusRegistry` | ~50 | Cache | **CACHE** → mobile data layer |
| `packages/shared/src/lib/backend/communityDataBackend.ts` (message RPCs) | ~400 | Logic/I/O | **KEEP** |
| `packages/shared/src/lib/backend/messageObjectStore.ts` | 125 | Logic/I/O | **KEEP** |
| `packages/shared/src/features/messaging/lib/banVisibility.ts` | 257 | Logic | **KEEP** (consolidate with projection during extract) |
| `packages/shared/src/features/messaging/lib/mergeMessageBundle.ts` | 97 | Logic | **KEEP** (wire into page merge or delete if unused) |
| `packages/shared/src/core/prefetchCommunityChannelMessages.ts` | 21 | Orchestration | **KEEP** (calls cache port) |
| `packages/shared/src/core/syncFocusFromRoute.ts` | 85 | Orchestration | **KEEP** |

---

## `CommunityMessageNexus.ts` — symbol inventory

### Layer 1 — extract to shared (pure)

| Symbol | Lines | Target home |
|--------|-------|-------------|
| `MESSAGE_PAGE_SIZE`, `MESSAGE_RELOAD_FRESHNESS_WINDOW_MS`, `PERSIST_MESSAGE_CAP` | 19–26 | `features/messaging/logic/constants.ts` |
| `coerceMediaExpiresInHours` | 69–76 | `features/messaging/logic/mediaSendRules.ts` |
| `stripEphemeralMediaUrls` | 84–106 | `features/messaging/logic/persistSnapshot.ts` |
| `messagesEqual` | 108–115 | `features/messaging/logic/equality.ts` |
| `channelMetaEqual` | 117–118 | `features/messaging/logic/equality.ts` |
| `insertIntoChannel` (index math) | 580–606 | `features/messaging/logic/channelIndex.ts` |
| `removeFromChannel` | 608–617 | `features/messaging/logic/channelIndex.ts` |
| Freshness gate in `ensureInitialLoaded` | 230–243 | `features/messaging/logic/freshness.ts` |
| RPC page → ascending + cursor (`loadInitial` shaping) | 201–215 | `features/messaging/logic/pageMerge.ts` |
| `loadOlder` cursor inputs | 257–278 | `features/messaging/logic/pageMerge.ts` |
| Optimistic send payload shape | 310–327 | `features/messaging/logic/optimisticSend.ts` |
| `sendWithMedia` validation + orchestration rules | 340–430 | `features/messaging/logic/mediaSendRules.ts` |
| Persist tail cap + dropped-older hasMore rule | 858–884 | `features/messaging/logic/persistSnapshot.ts` |
| `ChannelMeta`, `SendCommunityMessageMediaOptions` types | 50–64 | `features/messaging/logic/types.ts` |

### Layer 2 — per-platform cache shell

| Symbol | Lines | Notes |
|--------|-------|-------|
| `CommunityMessageNexus` class + private Maps | 120–161 | Relocate to mobile; Solid built fresh |
| `loadInitial` / `loadOlder` / send/edit/delete/react/report | 192–498 | Shell: calls shared logic + backend, writes store |
| Selector factories + snapshot Maps | 523–576 | **Delete** after unified store (channelState wart fix) |
| `insertMessage` / `upsertMessage` / `insertMessages` / mutations | 621–740 | Cache writes |
| `useChannel` / `useVisibleChannel` / loading hooks | 744–806 | React read layer (mobile) |
| `persist` / `rehydrate` | 849–935 | Platform persistence inject |
| `getLastMessageId` / `getChannelAuthorIds` | 808–822 | Sync cache reads |
| `clear` / inflight dedupe maps | 824–842, 160–161 | Lifecycle |

### Already shared logic (called, not duplicated)

- `projectVisibleChannelMessages` / `projectVisibleChannelMessagesBlockOnly`
- `viewerCommunityPolicyEqual` / `viewerPolicyHiddenAuthorIdsEqual`

---

## The `channelState`-outside-store wart

**Problem:** Zustand store holds `{ entities, revision }` only. Channel index (`byChannel`, cursors, hasMore, loading flags) lives on the class. Selectors close over `this.channelState` and poke `void state.revision` so zustand re-runs when `notifyRevision()` bumps without index data in store state.

**Symptoms:** snapshot Maps (`channelMessageSnapshots`, `channelMetaSnapshots`), per-channel selector factory Maps, split mutation paths.

**Success criterion:** Single reactive store shape per platform:

```
{ entities, byChannel, cursors, hasMore, initialLoadComplete, loadingInitial, loadingOlder, lastInitialLoadedAt }
```

No `revision` counter needed for index reactivity once index is in-store.

---

## `routeRealtimeEvent` MESSAGE_* boundary

| Case | Logic (shared) | Cache (platform port) |
|------|----------------|----------------------|
| MESSAGE_INSERT | `normalizeCreatedAt`, partial bundle construction (L58–89) | `insertMessage`, `upsertMessage` |
| MESSAGE_UPDATE | — | `upsertMessage` after fetch |
| MESSAGE_DELETE | — | `removeMessage` |

End state: shared defines `buildPartialMessageFromRealtimePayload()`; cache port interface typed in shared.

---

## Mobile blast radius

| File | Usage |
|------|-------|
| `apps/mobile/src/screens/main/CommunityChatScreen.tsx` | `core.messages.for(communityId)` → `useVisibleChannel`, `useChannelMeta`, `loadOlder`, `sendWithMedia`, `report` |
| `apps/mobile/src/navigation/MainNavigator.tsx` | `syncFocusFromRoute` → `prepareTextChannelMessages` |
| `apps/mobile/src/features/notifications/NotificationsContainer.tsx` | `syncFocusFromRoute` on deep-link |

**Precision contract:** `useVisibleChannel` must keep same equality fns and projection behavior. Screen API unchanged.

**Transitional web-client:** `CommunityWorkspaceShell.tsx`, `ChatArea.tsx` — same nexus API; alias to mobile data during cleave.

---

## Tests

| File | Action |
|------|--------|
| `nexus/__tests__/messageNexusLoad.test.ts` | Split: logic → shared unit tests; cache → mobile |
| `core/__tests__/routeRealtimeEvent.test.ts` | Keep in shared; mock cache port |
| `features/messaging/lib/__tests__/banVisibility.test.ts` | KEEP |
| `features/messaging/lib/__tests__/mergeMessageBundle.test.ts` | KEEP |

---

## Cleave checklist (Phase 2 sign-off)

- [x] Pure logic extracted to `packages/shared/src/features/messaging/logic/`
- [x] Mobile cache in `apps/mobile/src/data/messages/` with unified store (wart gone)
- [x] Solid cache in `packages/solid-client/src/data/messages/`
- [x] `viewerMessagePolicyStore` factory relocated to mobile
- [x] `MessageNexusRegistry` relocated to mobile
- [x] Shared cache port interface; `routeRealtimeEvent` uses port
- [x] No `CommunityMessageNexus` import from `packages/shared`
- [x] Session stores (`authStore`, `uiStore`, `userStatusStore`) relocated to mobile; Solid stubs in `solid-client`
- [x] `packages/react-bindings` and `packages/solid-bindings` deleted; hooks live under `@mobile-data`
- [x] Gates green: `mobile:typecheck`, `mobile:bundle`, `test:unit`, `typecheck:solid`
