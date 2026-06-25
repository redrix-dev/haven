# Messages domain cleave inventory

> Analysis artifact for [The Cleave](solid-migration-handoff.md) §4. Sorted against §0.4:
> _"Is this logic, or is this a cache?"_

**Status:** complete (true cleave on `feat/shared-core-hardening`). Checklist reflects final state.

---

## Surface area (post-relocation)

| File                                                                     | LOC   | Layer         | Disposition                                                        |
| ------------------------------------------------------------------------ | ----- | ------------- | ------------------------------------------------------------------ |
| `apps/mobile/src/data/messages/CommunityMessageCache.ts`                 | ~1000 | Cache         | **DONE** — mobile React cache                                      |
| `packages/shared/src/nexus/community/projectVisibleChannelMessages.ts`   | 121   | Logic         | **KEEP** in shared                                                 |
| `packages/shared/src/core/viewerMessagePolicy.ts`                        | 83    | Mixed         | Types + equality → **KEEP**; store factory → mobile                |
| `packages/shared/src/core/routeRealtimeEvent.ts` (MESSAGE\_\*)           | ~110  | Mixed         | Partial-row shaping → **KEEP**; cache via `RealtimeMutationTarget` |
| `apps/mobile/src/data/messages/registry.ts`                              | ~50   | Cache         | **DONE** — `MessageNexusRegistry` on `HavenReactCore`              |
| `packages/shared/src/lib/backend/communityDataBackend.ts` (message RPCs) | ~400  | Logic/I/O     | **KEEP**                                                           |
| `packages/shared/src/lib/backend/messageObjectStore.ts`                  | 125   | Logic/I/O     | **KEEP**                                                           |
| `packages/shared/src/features/messaging/lib/banVisibility.ts`            | 257   | Logic         | **KEEP**                                                           |
| `packages/shared/src/features/messaging/lib/mergeMessageBundle.ts`       | 97    | Logic         | **KEEP**                                                           |
| `apps/mobile/src/data/core/prefetchCommunityChannelMessages.ts`          | 21    | Orchestration | **DONE** — mobile                                                  |
| `apps/mobile/src/data/core/syncFocusFromRoute.ts`                        | 85    | Orchestration | **DONE** — mobile                                                  |

---

## `CommunityMessageCache.ts` — symbol inventory (was `CommunityMessageNexus.ts`)

### Layer 1 — extract to shared (pure)

| Symbol                                                                           | Lines   | Target home                                   |
| -------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| `MESSAGE_PAGE_SIZE`, `MESSAGE_RELOAD_FRESHNESS_WINDOW_MS`, `PERSIST_MESSAGE_CAP` | 19–26   | `features/messaging/logic/constants.ts`       |
| `coerceMediaExpiresInHours`                                                      | 69–76   | `features/messaging/logic/mediaSendRules.ts`  |
| `stripEphemeralMediaUrls`                                                        | 84–106  | `features/messaging/logic/persistSnapshot.ts` |
| `messagesEqual`                                                                  | 108–115 | `features/messaging/logic/equality.ts`        |
| `channelMetaEqual`                                                               | 117–118 | `features/messaging/logic/equality.ts`        |
| `insertIntoChannel` (index math)                                                 | 580–606 | `features/messaging/logic/channelIndex.ts`    |
| `removeFromChannel`                                                              | 608–617 | `features/messaging/logic/channelIndex.ts`    |
| Freshness gate in `ensureInitialLoaded`                                          | 230–243 | `features/messaging/logic/freshness.ts`       |
| RPC page → ascending + cursor (`loadInitial` shaping)                            | 201–215 | `features/messaging/logic/pageMerge.ts`       |
| `loadOlder` cursor inputs                                                        | 257–278 | `features/messaging/logic/pageMerge.ts`       |
| Optimistic send payload shape                                                    | 310–327 | `features/messaging/logic/optimisticSend.ts`  |
| `sendWithMedia` validation + orchestration rules                                 | 340–430 | `features/messaging/logic/mediaSendRules.ts`  |
| Persist tail cap + dropped-older hasMore rule                                    | 858–884 | `features/messaging/logic/persistSnapshot.ts` |
| `ChannelMeta`, `SendCommunityMessageMediaOptions` types                          | 50–64   | `features/messaging/logic/types.ts`           |

### Layer 2 — per-platform cache shell

| Symbol                                                           | Lines            | Notes                                                                      |
| ---------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `CommunityMessageCache` class + private Maps                     | 120–161          | Mobile cache; Solid built fresh                                            |
| `loadInitial` / `loadOlder` / send/edit/delete/react/report      | 192–498          | Shell: calls shared logic + backend, writes store                          |
| Selector factories + snapshot Maps                               | 523–576          | **Delete** after unified store (channelState wart fix)                     |
| `insertMessage` / `upsertMessage` / `insertMessages` / mutations | 621–740          | Cache writes                                                               |
| `useChannel` / `useVisibleChannel` / loading hooks               | 744–806          | **Removed from class** — standalone hooks in `@mobile-data/hooks/messages` |
| `persist` / `rehydrate`                                          | 849–935          | Platform persistence inject                                                |
| `getLastMessageId` / `getChannelAuthorIds`                       | 808–822          | Sync cache reads                                                           |
| `clear` / inflight dedupe maps                                   | 824–842, 160–161 | Lifecycle                                                                  |

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

## `routeRealtimeEvent` MESSAGE\_\* boundary

| Case           | Logic (shared)                                             | Cache (platform port)            |
| -------------- | ---------------------------------------------------------- | -------------------------------- |
| MESSAGE_INSERT | `normalizeCreatedAt`, partial bundle construction (L58–89) | `insertMessage`, `upsertMessage` |
| MESSAGE_UPDATE | —                                                          | `upsertMessage` after fetch      |
| MESSAGE_DELETE | —                                                          | `removeMessage`                  |

End state: shared defines `buildPartialMessageFromRealtimePayload()`; cache port interface typed in shared.

---

## Mobile blast radius

| File                                                                | Usage                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/screens/main/CommunityChatScreen.tsx`              | `core.messages.for(communityId)` → `useVisibleChannel`, `useChannelMeta`, `loadOlder`, `sendWithMedia`, `report` |
| `apps/mobile/src/navigation/MainNavigator.tsx`                      | `syncFocusFromRoute` → `prepareTextChannelMessages`                                                              |
| `apps/mobile/src/features/notifications/NotificationsContainer.tsx` | `syncFocusFromRoute` on deep-link                                                                                |

**Precision contract:** `useVisibleChannel` (from `@mobile-data/hooks/messages`) must keep same
equality fns and projection behavior. Screen API unchanged.

**Web/electron:** React desktop scaffolding is **broken / quarantined** until rebuilt on Solid.
Do not maintain transitional `@mobile-data` wiring for web-client.

---

## Tests

| File                                                                              | Action                                         |
| --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/mobile/src/data/__tests__/nexus/messageNexusLoad.test.ts`                   | **DONE** — mobile cache integration            |
| `apps/mobile/src/data/__tests__/core/routeRealtimeEvent.test.ts`                  | **DONE** — shared routing + mobile mock target |
| `packages/shared/src/features/messaging/lib/__tests__/banVisibility.test.ts`      | KEEP — shared pure logic                       |
| `packages/shared/src/features/messaging/lib/__tests__/mergeMessageBundle.test.ts` | KEEP — shared pure logic                       |

---

## Cleave checklist (Phase 2 sign-off)

- [x] Pure logic in `packages/shared/src/features/messaging/` (and related core helpers)
- [x] Mobile cache in `apps/mobile/src/data/messages/` (`CommunityMessageCache.ts`)
- [x] Solid stub in `packages/solid-client/src/data/messages/`
- [x] `viewerMessagePolicyStore` factory in mobile session layer
- [x] `MessageNexusRegistry` on `HavenReactCore`
- [x] `routeRealtimeEvent` uses `RealtimeMutationTarget` (no HavenCore import)
- [x] No reactive message cache in `packages/shared`
- [x] Session stores relocated to mobile; Solid stubs in `solid-client`
- [x] `packages/react-bindings` and `packages/solid-bindings` deleted; hooks under `@mobile-data/hooks`
- [x] Gates green: `npm run test:cleave` (lint · check:shared-portable · mobile:typecheck · mobile:bundle · test:unit)
