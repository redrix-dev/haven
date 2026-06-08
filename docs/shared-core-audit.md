# Shared-core audit (Step 3a — the fine-tooth comb)

> **⚠️ PARTIALLY SUPERSEDED by THE CLEAVE (2026-06-08).** Read
> [`solid-migration-handoff.md`](./solid-migration-handoff.md) §0 first. This file is still useful
> as the **catalog of what's in `packages/shared` today** — but its disposition framing ("decouple
> for Tauri/Solid" = make it framework-neutral + add adapters) is the *old* approach. Re-read each
> entry through the handoff's §0.4 test instead: **is it logic (→ stays in pure `shared`) or a cache
> (→ moves to a per-platform data layer)?** "🔧 decouple" entries are mostly *caches* that should
> **leave** `shared` for a platform, not become framework-neutral in place.

## Post-cleave snapshot (2026-06-08, true cleave)

| Area | Status |
|------|--------|
| `stores/` | **Deleted** — session stores in `apps/mobile/src/data/session/` |
| `nexus/*` reactive classes | **Relocated** to `apps/mobile/src/data/` |
| `nexus/Nexus.ts` base | **Relocated** to `apps/mobile/src/data/Nexus.ts` |
| `HavenCore` orchestration | **Relocated + renamed** → `apps/mobile/src/data/core/HavenReactCore.ts` |
| Cache injection ports | **Deleted** — mobile constructs caches directly |
| React host layer | **Relocated** — `AuthContext`, voice hooks, `useDataCacheComponentProbe` → mobile |
| Platform read hooks | **Standalone** — `apps/mobile/src/data/hooks/*` (no `use*` on cache classes) |
| Shared retains | Pure logic, types, selectors, `routeRealtimeEvent`, backend clients, port **types** only |
| `@shared/nexus` barrel | Entity/admin/voice **types** only — no ports, no classes |
| Integration tests | **Relocated** to `apps/mobile/src/data/__tests__/` |
| Web/Electron | **Broken (accepted)** — rebuild when Solid joins |

Living inventory of `packages/shared/src`. Goal: know exactly what's framework-coupled,
what's structurally crufty (hygiene, defer), and what's fine.

**Disposition legend**
- ✅ **fine as-is** — leave it
- 🧩 **decompose later** — works + portable, just big; own scoped step (3d), not a migration blocker
- 🔧 **decouple** — carries React/framework coupling; must be addressed for Tauri/Solid (3b)

---

## `lib/backend/` — ✅ entirely React-free
**16 files · ~7,027 lines · 0 React imports · 0 zustand.** The whole backend layer is already
framework-agnostic — **no decoupling work for the migration.** Only hygiene (decomposition),
all deferrable to its own gated step.

| File | Lines | React-free | Disposition |
|---|---:|:---:|---|
| `communityDataBackend.ts` | 2525 | ✅ | 🧩 **decompose (HIGH)** — split by domain (roles, channels, members, voice, bans, invites) |
| `types.ts` | 880 | ✅ | 🧩 decompose (LOW) — 103 exports; type barrel, split by domain someday (cosmetic) |
| `controlPlaneBackend.ts` | 709 | ✅ | 🧩 decompose (MED) — verify cohesion; split if multi-concern |
| `notificationBackend.ts` | 584 | ✅ | 🧩 decompose candidate (LOW–MED) |
| `serverModmailBackend.ts` | 572 | ✅ | 🧩 decompose candidate (LOW–MED) |
| `moderationBackend.ts` | 334 | ✅ | ✅ fine |
| `communityDataBackend.interface.ts` | 273 | ✅ | ✅ fine (splits alongside its impl) |
| `socialBackend.ts` | 272 | ✅ | ✅ fine |
| `directMessageBackend.ts` | 267 | ✅ | ✅ fine |
| `mediaAttachmentUtils.ts` | 168 | ✅ | ✅ fine |
| `directMessageAttachmentUtils.ts` | 126 | ✅ | ✅ fine |
| `messageObjectStore.ts` | 125 | ✅ | ✅ fine |
| `controlPlaneBackend.interface.ts` | 81 | ✅ | ✅ fine |
| `index.ts` | 51 | ✅ | ✅ fine (barrel) |
| `voiceTokenBackend.ts` | 31 | ✅ | ✅ fine (clean; used in the voice probe) |
| `directMessageUtils.ts` | 29 | ✅ | ✅ fine |

### Decomposition backlog (deferred → Step 3d, not the decoupling step)
1. **`communityDataBackend.ts` (2525)** — the only urgent-ish one. A god-file; split by domain.
   Pure hygiene, zero migration risk (already portable on all platforms).
2. `controlPlaneBackend.ts` (709), `notificationBackend.ts` (584), `serverModmailBackend.ts` (572)
   — assess cohesion; split only if they're doing multiple unrelated things.
3. `types.ts` (880) — optional split of the type barrel by domain; lowest priority.

**Backend verdict:** nothing to decouple, nothing urgent to rewrite. Confirms the 2,525-line
"crap" is portable — it's a *future tidy*, not a Tauri blocker.

---

## `stores/` — ✅ deleted (cleave complete)

Relocated to `apps/mobile/src/data/session/` (React) and `packages/solid-client/src/data/session/`
(Solid stubs). The `packages/shared/src/stores/` directory has been removed.

### Other zustand in shared (post-cleave)
| File | Disposition |
|---|---|
| `core/viewerMessagePolicy.ts` | ✅ **fine** — vanilla `createStore` policy state; consumed by mobile cache via port type |
| `debug/instrumentZustandStore.ts` | ✅ type-only `StoreApi` — vanilla-compatible |

## `core/` — ✅ orchestration relocated; shared retains pure surface

| Was in shared | Now |
|---|---|
| `HavenCore.ts` | `apps/mobile/src/data/core/HavenReactCore.ts` |
| `useHavenCore`, registries, bootstrap, focus/sync, commands | `apps/mobile/src/data/core/` |
| Cache injection ports | **Deleted** |
| `routeRealtimeEvent.ts` | **Kept** — operates on `RealtimeMutationTarget` interface |
| `realtimeMutationTarget.ts` | **New** — minimal mutation interface for shared routing |
| `sessionBackendRegistry.ts` | **New** — imperative backend accessors without HavenCore import |
| `communityChannelUtils`, `viewerMessagePolicy`, `backends`, … | **Kept** — pure logic |

## `nexus/` — ✅ relocated to mobile (cleave complete)

All reactive nexus classes now live under `apps/mobile/src/data/`. `packages/shared/src/nexus/`
exports **types only** (entity/admin/voice state shapes, selectors live in subpaths).

| Was in shared | Now |
|---|---|
| `Nexus.ts` base | `apps/mobile/src/data/Nexus.ts` |
| Entity nexuses (Community, Channel, DM, Notification) | `apps/mobile/src/data/{communities,channels,direct-messages,notifications}/` |
| Service nexuses (Admin, Moderation, Social, …) | `apps/mobile/src/data/{community,social,profile,...}/` |
| `CommunityMessageNexus` | `apps/mobile/src/data/messages/CommunityMessageCache.ts` |
| Integration tests | `apps/mobile/src/data/__tests__/nexus/` |

**Read pattern:** UI imports `@mobile-data/hooks` (e.g. `useFriends(core.social)`), not
`core.social.useFriends()`. Cache classes expose `reactiveStore` + imperative/sync methods only.

**Still in shared under `nexus/`:** pure selectors (`*Selectors.ts`), `projectVisibleChannelMessages.ts`,
type barrels (`communityTypes.ts`, `channelTypes.ts`, …).

## Binding layer (hooks/context) — ✅ relocated to mobile

| File | Disposition |
|---|---|
| `contexts/AuthContext.tsx` | ✅ moved → `apps/mobile/src/contexts/` |
| `features/voice/hooks/useVoice.ts` | ✅ moved → `apps/mobile/src/features/voice/hooks/` |
| `features/voice/hooks/useVoiceMemberVolumes.ts` | ✅ moved → mobile |
| `core/useHavenCore.ts` | ✅ moved → `apps/mobile/src/data/core/` |
| `debug/useDataCacheComponentProbe.ts` | ✅ moved → `apps/mobile/src/debug/` |

## `platform/` vs `infrastructure/platform/` — 🧩 dedup (one wrinkle)
| File | State | Disposition |
|---|---|---|
| `urls.ts` | **identical** in both | 🧩 delete one + repoint imports (cheap → 3c) |
| `appHost.ts` | **differs** between the two | ⚠️ reconcile — *not* a pure dup (which is canonical? mobile imports `@shared/platform/…`, others `@shared/infrastructure/platform/…`) |
| `deepLinks.ts`, `webRouter.ts` | only in `infrastructure/` | ✅ no dup |
| `desktop/` `ipc/` `lib/` subdirs | likely also duplicated | check during execution |

---

## Decoupling surface — final tally (post true cleave)

- **`nexus/` reactive classes** — ✅ all relocated to `apps/mobile/src/data/`
- **binding layer** — ✅ relocated to mobile (`AuthContext`, voice hooks, `useHavenCore`, debug probe)
- **`stores/`** — ✅ deleted from shared; mobile session stores in `apps/mobile/src/data/session/`
- **`core/` orchestration** — ✅ relocated to mobile as `HavenReactCore` + `core/*`
- **`lib/backend/`** — ✅ React-free; `sessionBackendRegistry` replaces `requireHavenCore()` coupling
- **`platform/`** — 🧩 dedup hygiene only (unchanged)

**Takeaway:** `packages/shared` is now logic + types + backend clients. All reactive/cache
machinery lives in mobile (React) or Solid stubs. Gate: `npm run test:cleave`.
