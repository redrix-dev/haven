# Shared-core audit (Step 3a — the fine-tooth comb)

> **⚠️ PARTIALLY SUPERSEDED by THE CLEAVE (2026-06-08).** Read
> [`solid-migration-handoff.md`](./solid-migration-handoff.md) §0 first. This file is still useful
> as the **catalog of what's in `packages/shared` today** — but its disposition framing ("decouple
> for Tauri/Solid" = make it framework-neutral + add adapters) is the *old* approach. Re-read each
> entry through the handoff's §0.4 test instead: **is it logic (→ stays in pure `shared`) or a cache
> (→ moves to a per-platform data layer)?** "🔧 decouple" entries are mostly *caches* that should
> **leave** `shared` for a platform, not become framework-neutral in place.

## Post-cleave snapshot (2026-06-08)

| Area | Status |
|------|--------|
| `stores/` | **Deleted** — session stores in `apps/mobile/src/data/session/` + Solid stubs |
| `nexus/*` reactive classes | **Relocated** to `apps/mobile/src/data/` |
| `nexus/{feature-flags,onboarding,permissions,profile,social,voice}/` | **Removed** — empty placeholders, never populated post-cleave |
| Shared retains | Types, selectors, `Nexus.ts` base (transitional), cache **port interfaces** |
| `@shared/nexus` barrel | Shared types + ports only; concrete classes → `@mobile-data/*` |

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

### Other zustand users (caught in the final sweep)
| File | Lines | Disposition |
|---|---:|---|
| `core/viewerMessagePolicy.ts` | 83 | 🔧 standalone zustand `create` store → vanilla + adapter (small) |
| `debug/instrumentZustandStore.ts` | 65 | ✅ type-only `StoreApi` — already vanilla-compatible; works (better) post-migration |

## `nexus/` — 🔧 the bulk of the decoupling (~7.7k lines, 13 React-coupled classes)
This is where Step 3b actually lives. **Two patterns**, which changes the strategy:

**Entity-Nexus** — extend the base `Nexus<T,R>`.
| File | Lines | | File | Lines |
|---|---:|---|---|---:|
| `CommunityMessageNexus` | 1009 | | `Community` | 384 |
| `DirectMessageNexus` | 1016 | | `Notification` | 442 |
| `ChannelNexus` | 716 | | | |

> **⚠️ 3b.2 discovery (CI-gated revert) — "fix base → 5 inherit" was WRONG.** Converting the base
> to vanilla in isolation does **not** typecheck; the entity family is more coupled (and inconsistent)
> than the grep implied:
> - **`use<S>` on the base is NOT dead** — `CommunityMessageNexus` calls `this.use()` ×5. (Only
>   `useAll`/`useOne` are dead — my earlier grep filtered out `Nexus.ts` files and hid this.)
> - **4 of 5 override `get store()`** with their own (extended) store shape (`UseBoundStore`) +
>   call `useStore(this.store, …)` for bespoke hooks: Channel (3), Community (5), DirectMessage (3),
>   Notification (5). Making the base `store` public/vanilla collides with their `protected` overrides
>   and their callable hook-store usage.
>
> **Revised approach:** treat the entity family like the service classes — a **per-class loop** (base +
> one subclass at a time, relocate its store override + bespoke hooks → react/solid-bindings + migrate
> call sites), each CI-gated. There is **no free "base fix clears 5."** Effort ≈ the service-Nexus grind.

**Service-Nexus** — standalone classes, each with its **own** `zustand create` + React hooks
(don't extend the base). *Each needs its own conversion — this is the per-file grind.*
**Rename convention (decided):** these get `<Domain>Nexus` → `<Domain>ControllerNexus` during the
lift (e.g. `ProfileControllerNexus`). The entity-cache classes above keep the bare `…Nexus` name.
Future: extract a base `ControllerNexus.ts` once the shape is apparent (earmarked, not now).
| File | Lines | | File | Lines |
|---|---:|---|---|---:|
| `CommunityAdminNexus` | 1133 | | `CommunityModerationNexus` | 266 |
| `VoiceNexus` | 716 | | `PermissionsNexus` | 263 |
| `ProfileNexus` | 630 | | `OnboardingNexus` | 233 |
| `SocialNexus` | 377 | | `FeatureFlagNexus` | 151 |

Plus: `Nexus.ts` base (189, 🔧 the keystone), `index.ts` (23, ✅), `projectVisibleChannelMessages.ts`
(121, ✅ React-free).

**Strategy:** fix the base → 5 entity-Nexus inherit it; then convert the 8 service-Nexus
**class-by-class** (mechanical, repeatable — *not* big-bang). Many are also large → 🧩 decompose
candidates, but **decomposition is 3d, deferred — do not split while decoupling (3b).**

## Binding layer (hooks/context) — 🔧 needs Solid equivalents
| File | Lines | Disposition |
|---|---:|---|
| `contexts/AuthContext.tsx` | 462 | 🔧 substantial — React Context provider; Solid provider + logic extract |
| `features/voice/hooks/useVoice.ts` | 385 | 🔧 substantial — voice orchestration hook; Solid rewrite |
| `features/voice/hooks/useVoiceMemberVolumes.ts` | 161 | 🔧 hook → Solid rewrite |
| `core/useHavenCore.ts` | 25 | 🔧 trivial — `useSyncExternalStore` → Solid `from()` (the canonical binding) |
| `debug/useDataCacheComponentProbe.ts` | 31 | 🔧 trivial — debug hook; rewrite or drop |

## `platform/` vs `infrastructure/platform/` — 🧩 dedup (one wrinkle)
| File | State | Disposition |
|---|---|---|
| `urls.ts` | **identical** in both | 🧩 delete one + repoint imports (cheap → 3c) |
| `appHost.ts` | **differs** between the two | ⚠️ reconcile — *not* a pure dup (which is canonical? mobile imports `@shared/platform/…`, others `@shared/infrastructure/platform/…`) |
| `deepLinks.ts`, `webRouter.ts` | only in `infrastructure/` | ✅ no dup |
| `desktop/` `ipc/` `lib/` subdirs | likely also duplicated | check during execution |

---

## Decoupling surface — final tally (what 3b must actually touch)
- **`nexus/`** — the bulk: base + **8 service classes** (the grind) + 5 entity classes (inherit the base fix). ~7.7k lines.
- **binding layer** — 5 files (`AuthContext` + `useVoice` substantial; the other 3 small).
- **`stores/`** — 3 tiny stores + `core/viewerMessagePolicy.ts` (1 small policy store).
- **`lib/backend/`** — **nothing** (already React-free ✅).
- **`platform/`** — dedup is 🧩 hygiene, not decoupling.

**Takeaway:** decoupling is concentrated in **nexus + the binding hooks**. The base-Nexus fix is
high-leverage (clears 5 subclasses); the 8 standalone service-Nexus classes are the real volume.
Backend and most utils are already free. Sizeable nexus files are *also* 3d decompose candidates —
kept strictly separate from the 3b decoupling pass.
