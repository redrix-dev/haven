# Haven Rebuild — Handoff (THE CLEAVE)

> Cold-start orientation for the data/cache rebuild. **Read §0 (the ruleset) before
> touching anything.** This document supersedes the previous "framework-agnostic
> shared core / Approach C" plan — see §5 for why and what that means for work
> already on the branch.

**Phase right now:** mobile data/cache cleave **complete**. `packages/shared` is pure logic;
`HavenReactCore` + all React caches live in `apps/mobile/src/data/`. **NOT** building
Solid screens/features yet — that is the next phase (see §7–§8).

---

## §0 — THE RULESET (the laws; an agent follows these literally)

These are non-negotiable. If a step would violate one, stop and rethink the step.

1. **Three layers, dependencies point inward.**
   `shared (pure logic) → consumed by → per-platform cache → consumed by → per-platform UI`.
   Shared never imports a platform or a cache. A cache never imports another platform's cache.

2. **Caches are per-platform. A reactive store is NEVER shared across frameworks.**
   Mobile (React Native) owns one cache. Desktop+web (Tauri/Solid) own another. There is
   **no** framework-neutral reactive store and **no** binding adapter bridging one
   framework's store into another. Bridging React and Solid reactivity is the exact
   mistake this rebuild exists to undo. Do not reintroduce it.

3. **Logic is shared and pure.** Anything that is *data-in → data-out* — fetching,
   merging realtime events, visibility/permission filtering, pagination math, event
   routing, (de)serialization, domain rules, types — lives in `packages/shared`, imports
   **zero** framework, and is identical on every platform.

4. **The sorting test (apply to every file/function you touch):**
   *"Is this logic, or is this a cache?"*
   - **Logic** = a pure function, no held state, no notion of "a screen is watching" → **shared**.
   - **Cache** = holds entities in memory and notifies the screen when they change → **per-platform**.
   - When unsure, it is **logic** until it provably must hold reactive state.

5. **`packages/shared` contains zero reactivity. Ever.** No `react`, no `solid-js`, no
   React-flavored `zustand` (`zustand`, `zustand/traditional`, `zustand/react`). Plain
   functions, plain data, types. Enforced by `check:shared-portable` (see §6).

6. **Mobile is a LIVE product in alpha. Do not break it.** Its React cache keeps working
   at all times. Change it only deliberately, gated, on its own schedule — never as a
   side effect of desktop/Solid work. Mobile keeps React's native selector/repaint model
   with zero cross-platform compromise. (Precision lives in *how the screen reads*; the
   cleave does not touch that — see §1.)

7. **Desktop+web (Solid) own their cache natively.** Build it the Solid way (fine-grained
   stores/signals), consuming the shared logic. Do not make Solid read through a
   zustand-shaped adapter.

8. **Extract logic; never duplicate it.** When you find logic *inside* a cache, lift it
   into `packages/shared` as a pure function and have the cache *call* it. Both platforms'
   caches call the same shared function. The thin "hold + notify" shell may be written
   twice (once per platform) — duplicating something *dumb* is cheap and safe; duplicating
   something *smart* is the bug factory we're removing.

9. **No app/UI/feature build in this phase.** This phase is data/cache only. Do not start
   building screens on the new structure until the cleave is complete and green.

10. **Everything is gated, every step.** Mobile stays green (`npm run test:cleave` =
    `lint` · `check:shared-portable` · `mobile:typecheck` · `mobile:bundle` ·
    `test:unit`). Shared stays pure (`check:shared-portable`, empty exclusions).
    Web `typecheck` and `typecheck:solid` are **quarantined** until the Solid app build.

---

## §1 — The mental model (plain English)

The whole app is three layers. The only hard question is *which layer a thing belongs to.*

- **The thinking (shared, pure).** Turn a Supabase row into the right list to show:
  fetch a page, merge a realtime event, filter for blocks/bans, prepend older messages,
  decide what to persist. These are plain functions — data in, data out. They don't know
  or care that a screen exists. **This is the same on every platform.** Most of it is
  *already* framework-free in the repo (`projectVisibleChannelMessages`, `routeRealtimeEvent`,
  the backend clients, the types).

- **The live copy (per-platform cache).** Hold "the messages for the channel I'm looking
  at," and poke the screen when it changes. That's the *entire* job. It is small — *because
  all the thinking happened upstream.* React-Native and Solid do "hold + poke" in
  fundamentally different ways, so this is the one layer you **must not** share: you write
  it twice, tiny, each in its platform's native dialect.

- **The UI (per-platform).** Obviously per-platform. Not in scope this phase.

**Why precision survives the cleave (the thing we proved on `CommunityChatScreen.tsx:217`):**
A screen repaints surgically because it *watches one narrow thing and bails when that thing
looks unchanged.* That is a property of **how the screen reads**, not of where the logic
lives or whether the cache is shared. Moving the thinking out of the cache, and not sharing
the cache, changes **nothing** about how a screen subscribes. Mobile keeps its surgical
re-renders exactly. The confusing machinery (snapshot caches, `revision` counters, selector
factories) only ever existed to prop up a *shared, fat* cache on a coarse substrate — remove
the sharing and the fatness and that machinery has no reason to exist.

**One sentence:** *Before, we shared the memory and had to make it smart. Now, we share the
smarts and let each platform keep its own dumb memory.*

---

## §2 — Where we are now (honest current state)

**Branch:** `feat/shared-core-hardening` (off `staging`). **The true cleave is complete**
for mobile: `packages/shared` is pure logic; the React cache + composition root live
entirely in `apps/mobile/src/data/`.

**Current architecture:**
- **Shared (pure):** domain logic (`features/*/logic/`), selectors, `routeRealtimeEvent`
  over `RealtimeMutationTarget`, backend clients, entity/admin/voice state types,
  `sessionStorePorts` (port types only), `sessionBackendRegistry` for imperative backend
  accessors. **Zero** `react`, **zero** React-flavored `zustand`, **zero** `use*` cache
  APIs, **zero** reactive base class. Enforced by `check:shared-portable` with **empty**
  exclusion list.
- **Mobile (React):** full data layer under `apps/mobile/src/data/`:
  - `Nexus.ts` — entity cache base class (zustand + React hooks on base only)
  - `core/HavenReactCore.ts` — session composition root (implements `RealtimeMutationTarget`)
  - `core/` — registries, bootstrap phase, focus/sync, orchestration commands
  - Entity + service nexuses (communities, channels, DMs, notifications, admin, …)
  - `hooks/*` — standalone selector-hooks (`useFriends(core.social)`, etc.); **no `use*` on cache classes**
  - `session/` — auth, UI, userStatus, viewerMessagePolicy stores
  - `__tests__/` — integration tests (relocated from shared)
  - Wired at app entry via `createReactHavenCore({ client, publicConfig, persistence })`
  - React host layer relocated: `contexts/AuthContext.tsx`, `features/voice/hooks/*`, `debug/useDataCacheComponentProbe.ts`
- **Solid (Tauri):** stub caches under `packages/solid-client/src/data/`. **Not built
  against real backends yet** — blocked until mobile cache isolation is signed off (done).

**Deleted from shared (no backward-compat shims):**
- `HavenCore.ts`, `useHavenCore.ts`, `bootstrapPhase.ts`, orchestration commands,
  `sessionStoreRegistry.ts`, cache injection ports (`entityNexusPorts`,
  `platformNexusPorts`, `communityMessageCachePort`), reactive `Nexus.ts` base,
  `AuthContext.tsx`, voice hooks, `useDataCacheComponentProbe.ts`.

**Accepted breakage (known, not gated):**
- React desktop (`web-client`/electron/web) — imports removed shared orchestration and
  `@mobile-data` scaffolding; **will not typecheck** until rebuilt on Solid.
- `typecheck:solid` — quarantined from `test:ci` until Solid app build phase.

**Gates (cleave north star):** `npm run test:cleave` =
`lint` · `check:shared-portable` · `mobile:typecheck` · `mobile:bundle` · `test:unit`
(shared pure tests + mobile data tests only).

---

## §2 (archived) — Pre-cleave state

<details>
<summary>Previous state before Phases 5–6 (superseded)</summary>

**Branch:** `feat/shared-core-hardening` (off `staging`). Five commits of the *old*
approach (now superseded — see §5):
`3b.1` binding packages · `ChannelNexus` · `CommunityNexus` · `DirectMessageNexus` ·
`NotificationNexus` (each converted to "vanilla zustand core + React bindings + Solid
bindings"). `CommunityMessageNexus` was deliberately **paused** before conversion — good;
we stop there.

**The core problem, stated plainly:** `packages/shared` currently **mixes the two layers**.
The `nexus/` classes are *reactive caches* living inside the supposedly-shared layer. That
mixing — a reactive cache that both platforms were meant to share — is the source of the
illegibility (the snapshot caches, `revision` bumps, selector factories, the dual binding
adapters). The cleave removes the mixing.

**What is already in good shape (keepers — these are Layer 1):**
- Pure projections extracted during the old work: `channelSelectors.ts`,
  `communitySelectors.ts`, `dmSelectors.ts`, `notificationSelectors.ts`.
- Pre-existing pure logic: `projectVisibleChannelMessages.ts`, `routeRealtimeEvent.ts`,
  `viewerMessagePolicy` (state/equality parts), `communityDisplayOrder`, the backend
  clients in `lib/backend/`, the types.
- The guard `check:shared-portable` and the `test:cleave` gate (`mobile:bundle` included).
  Web `typecheck` / `typecheck:solid` quarantined until Solid app build.

**What is superseded (see §5 for disposition):**
- The "one framework-neutral reactive store shared by both platforms" idea (Approach C).
- `packages/solid-bindings` as "Solid adapters over a shared zustand store."
- `packages/react-bindings` as a *shared* package (its content is really *mobile's* React
  read layer).

</details>

---

## §3 — Where we need to be (target)

```
packages/shared/                 PURE. zero framework, zero reactivity.
  lib/backend/                     Supabase clients, RPC wrappers, network shapes
  domain/  (or features/*/logic)   pure transforms: merge, filter/visibility, paginate,
                                   route realtime events, (de)serialize, domain rules
  types/                           shared types
  — NO reactive stores. NO nexus classes. NO react/solid/zustand-react imports.

apps/mobile/  (React Native)     MOBILE'S OWN WORLD
  .../data/                        the React cache (today's Nexus, relocated + thinned),
                                   holds entities reactively, CALLS packages/shared logic.
                                   Keeps React's selector/equality repaint model. Untouched
                                   precision.

<solid world>  (Tauri/Solid)     DESKTOP+WEB'S OWN WORLD
  .../data/                        a Solid-native cache (fine-grained stores/signals),
                                   holds entities reactively, CALLS packages/shared logic.
                                   Built fresh; no zustand adapter underneath.
```

End state: **no reactive store in `packages/shared`; no cache shared across frameworks;
each platform reads its own cache in its own idiom; all the thinking lives once, in shared.**

---

## §4 — The cleave plan (complete for mobile)

**Status:** executed on `feat/shared-core-hardening`. All domains relocated; shared is pure.
Solid stub caches exist under `packages/solid-client/src/data/` but are not wired to real
backends yet.

<details>
<summary>Per-domain loop (reference — completed)</summary>

Work **one domain at a time** (messages, channels, communities, DMs, notifications, service
domains). For each domain: inventory → extract shared logic → relocate mobile cache → build
Solid stub → gate (`test:cleave`) → next.

When all domains are cleaved: delete shared reactive layer + injection ports. **Done.**

</details>

---

## §5 — Disposition of prior work (keep / repurpose / retire)

| Artifact | Disposition |
|---|---|
| `channelSelectors` / `communitySelectors` / `dmSelectors` / `notificationSelectors` | **KEEP** — these are Layer-1 shared logic. |
| `projectVisibleChannelMessages`, `routeRealtimeEvent`, `viewerMessagePolicy` (pure parts), `communityDisplayOrder`, `lib/backend/*`, types | **KEEP** — already Layer 1. |
| The converted nexus classes (Channel/Community/DM/Notification, vanilla zustand) | **REPURPOSE** → become *mobile's* React cache; **relocate** out of `packages/shared` into mobile's world. Their inline logic gets pushed down into shared functions over time. |
| `packages/react-bindings` | **REPURPOSE** → it's *mobile's* React read layer, not a shared package. Fold into mobile's data world (or keep only while React desktop `web-client` still exists, then retire). |
| `packages/solid-bindings` | **RETIRE** — Solid owns its cache natively; adapters-over-zustand are the thing we're removing. The generic `fromStore`/`createStoreSelector` may seed the Solid cache's primitives, then go. |
| `check:shared-portable` guard | **KEEP + ENFORCED** — empty `frameworkImportExclusions`; flags `use*` exports under `core/**`. |
| `test:cleave` gate | **KEEP** — `lint` · `check:shared-portable` · `mobile:typecheck` · `mobile:bundle` · `test:unit`. |
| `test:ci` | Runs `test:cleave` + DB/backend suites; web `typecheck` and `typecheck:solid` quarantined. |
| `mobile:bundle` | **KEEP** — headless Expo export; proves mobile module graph resolves. |
| "Approach C" / framework-agnostic shared reactive core | **SUPERSEDED + REMOVED.** |

**Nothing valuable is lost:** the pure-logic extraction was the right half of the old work
and it survives. The dual-binding / shared-reactive-store half was the wrong half — it was
the tax of sharing a cache across frameworks — and it stops here.

---

## §6 — Guardrails & gates (must stay green)

- **`check:shared-portable`** — `packages/shared` imports no `react`/`solid-js`/React-flavored
  `zustand`. **Empty exclusion list.** Also rejects hook-shaped `use*` exports under `core/**`.
- **`npm run test:cleave`** — north-star gate: `lint` · `check:shared-portable` ·
  `mobile:typecheck` · `mobile:bundle` · `test:unit` (shared pure tests +
  `apps/mobile/src/data/__tests__/`).
- **`mobile:typecheck`** — mobile types clean (includes test files under `apps/mobile`).
- **`mobile:bundle`** — headless `expo export`; proves mobile's whole module graph resolves.
- **`test:unit`** — shared pure logic tests + mobile data integration tests only (web-client
  and electron tests removed from the gate).
- **Quarantined (accepted red):** web `typecheck` (`tsconfig.web.json`), `typecheck:solid`.
  React desktop (`web-client`/electron) will not compile until rebuilt on Solid.

Verification discipline: **never trust a piped exit code** (`… | tail` returns tail's status,
not the command's). Redirect to a file and check the real `$?`.

---

## §7 — Explicitly NOT in this phase

- Building screens, features, or the Solid app UI on the new structure.
- Designing the Tauri desktop shell / web shell beyond what's needed to host a cache.
- Touching mobile's *features* (only its data layer's plumbing, gated).
- Any "make it pretty" pass on transitional React desktop (`web-client`/electron/web) — it's
  scaffolding that Solid replaces; keep it building, nothing more.

The app build is the **next** phase. It starts only when §4 mobile cleave is done and
`npm run test:cleave` is green — **both met on this branch**.

---

## §8 — Next concrete step

**Mobile cleave exit criteria met** (`npm run test:cleave` green).

**Next phase (Solid app build — handoff §7):**
1. Flesh out Solid-native cache I/O in `packages/solid-client/src/data/` (stubs → real backends).
2. Implement `HavenSolidCore` (Solid counterpart to `HavenReactCore`) and wire Tauri/Solid UI.
3. Rebuild React desktop (`web-client`/electron) on Solid — do not maintain transitional `@mobile-data` imports.

**Completed in true cleave (no longer pending):**
- `HavenCore` → `HavenReactCore` in `apps/mobile/src/data/core/`
- Cache injection ports deleted; mobile constructs caches directly
- `Nexus.ts` base, `AuthContext`, voice hooks, debug probe relocated to mobile
- Standalone selector-hooks; `use*` stripped from cache classes
- Integration tests relocated to `apps/mobile/src/data/__tests__/`
- `sessionBackendRegistry` in shared for imperative `getXBackend()` without HavenCore coupling

Reference inventory: **`docs/messages-cleave-inventory.md`** — template used for all domains.

## Reference docs (read in this order)
- **This file** — the ruleset + current/target state + the cleave plan.
- **`docs/tauri-solid-roadmap.md`** — phases & decision history (Phase 2 now = The Cleave).
- **`docs/shared-core-audit.md`** — original shared-core inventory. *Partially superseded:*
  read it as "the catalog of what's in `shared` today," then apply the §0.4 test to each entry.
- **`docs/tauri-solid-rebuild.md`** — original intent + React→Solid mapping (Kobalte/virtua/etc.),
  relevant later for the app-build phase.
- **Origin of the pattern:** the Nexus design was lifted from the stoat/Revolt client SDK,
  which runs the same collection pattern on **Solid's** fine-grained reactivity — which is
  *why* their version has none of the snapshot/revision/selector machinery, and why moving the
  desktop cache to Solid returns it to the substrate the pattern was born for.
