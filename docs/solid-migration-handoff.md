# Haven Rebuild — Handoff (THE CLEAVE)

> Cold-start orientation for the data/cache rebuild. **Read §0 (the ruleset) before
> touching anything.** This document supersedes the previous "framework-agnostic
> shared core / Approach C" plan — see §5 for why and what that means for work
> already on the branch.

**Phase right now:** cleaving the data layer. **NOT** building screens/features yet.
The app/UI build is a *later* phase and is explicitly out of scope until the cleave
is done and green (see §7).

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

10. **Everything is gated, every step.** Mobile stays green (`mobile:typecheck`,
    `mobile:bundle`, mobile tests). Shared stays pure (`check:shared-portable`). Solid
    typechecks (`typecheck:solid`). Nothing merges red. Small commits, one domain at a time.

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

**Branch:** `feat/shared-core-hardening` (off `staging`). **The cleave is complete**
(all domains + session/bindings + cache port decoupling). `packages/shared` is a pure
logic + port layer; reactive caches live per-platform.

**Current architecture:**
- **Shared (pure):** domain logic (`features/*/logic/`), selectors, `routeRealtimeEvent`,
  cache port interfaces (`entityNexusPorts`, `platformNexusPorts`, `communityMessageCachePort`),
  backend clients, entity/admin/voice state types. `@shared/nexus` barrel exports shared
  types and ports only — no `@mobile-data` imports.
- **Mobile (React):** full data layer under `apps/mobile/src/data/` — message
  cache, entity nexuses, session stores (`authStore`, `uiStore`,
  `userStatusStore`), React read hooks (`@mobile-data/hooks`). Wired via
  `createReactHavenCore`. Concrete nexus classes import from `@mobile-data/*`.
- **Solid (Tauri):** native caches under `packages/solid-client/src/data/`
  including message cache and session store stubs. No zustand adapter.
- **Retired:** `packages/react-bindings`, `packages/solid-bindings`,
  `packages/shared/src/stores/`, and empty post-cleave placeholder dirs under
  `packages/shared/src/nexus/{feature-flags,onboarding,permissions,profile,social,voice}`.
  The dual-binding / shared-reactive-store approach (Approach C) is fully superseded.

**What remains transitional (not blocking gates):**
- `packages/shared/src/nexus/Nexus.ts` — base entity cache class still imported
  by mobile nexuses; scheduled for mobile relocation.
- `packages/shared/src/contexts/AuthContext.tsx` and voice hooks — React host
  layer still in shared; relocate in a later phase.
- `packages/shared/src/nexus/__tests__/*` — integration tests still construct
  mobile nexuses via `@mobile-data` (acceptable; keeps `@mobile-data` in
  `tsconfig.node.json` for shared test runs only).
- React desktop (`web-client`/electron/web) imports mobile's data layer via
  `@mobile-data` as scaffolding until Solid replaces it.

**Gates (all green post-cleave):** `check:shared-portable` · `mobile:typecheck` ·
`mobile:bundle` · `typecheck:solid` · `test:unit`

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
- The guard `check:shared-portable` and the CI gates `mobile:bundle` + `typecheck:solid`.

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

## §4 — The cleave plan (data/cache only; per-domain, gated)

Work **one domain at a time** (messages, channels, communities, DMs, notifications, and the
service domains). Messages is the worst offender — do it first as the template, *or* do it
last as the capstone; either way, treat its `channelState`-outside-the-store wart as the
thing to fix by putting index state *in* whichever cache holds it.

For each domain:

1. **Inventory.** Sort the domain's current code against the §0.4 test into two lists:
   *logic* (pure) vs *cache* (reactive). Write it down. (The first concrete artifact to
   produce is this inventory for **messages** — see §8.)
2. **Extract / confirm the shared logic.** Ensure every *logic* item is a pure function in
   `packages/shared`, framework-free. Most already are or are close (the `*Selectors` files,
   `projectVisibleChannelMessages`, `routeRealtimeEvent`). Fill gaps (merge, pagination,
   page-fetch shaping) as pure functions.
3. **Mobile cache → call shared logic + relocate.** Point mobile's reactive cache at the
   shared functions (it largely has the logic inline today). Relocate the reactive cache out
   of `packages/shared` into mobile's world. Do this **gated, without breaking alpha** —
   mobile keeps passing `mobile:typecheck` / `mobile:bundle` / tests at every step.
4. **Solid cache → build native.** Build the Solid-native cache for the domain, consuming
   the same shared logic. Fine-grained, idiomatic, no zustand.
5. **Gate before next domain:** mobile green · shared pure (`check:shared-portable`) ·
   `typecheck:solid` green.

When all domains are cleaved: delete the now-empty shared reactive layer + retired adapter
packages (§5), and `packages/shared` is provably pure.

---

## §5 — Disposition of prior work (keep / repurpose / retire)

| Artifact | Disposition |
|---|---|
| `channelSelectors` / `communitySelectors` / `dmSelectors` / `notificationSelectors` | **KEEP** — these are Layer-1 shared logic. |
| `projectVisibleChannelMessages`, `routeRealtimeEvent`, `viewerMessagePolicy` (pure parts), `communityDisplayOrder`, `lib/backend/*`, types | **KEEP** — already Layer 1. |
| The converted nexus classes (Channel/Community/DM/Notification, vanilla zustand) | **REPURPOSE** → become *mobile's* React cache; **relocate** out of `packages/shared` into mobile's world. Their inline logic gets pushed down into shared functions over time. |
| `packages/react-bindings` | **REPURPOSE** → it's *mobile's* React read layer, not a shared package. Fold into mobile's data world (or keep only while React desktop `web-client` still exists, then retire). |
| `packages/solid-bindings` | **RETIRE** — Solid owns its cache natively; adapters-over-zustand are the thing we're removing. The generic `fromStore`/`createStoreSelector` may seed the Solid cache's primitives, then go. |
| `check:shared-portable` guard | **KEEP + STRENGTHEN** — repurpose to enforce "`packages/shared` is pure" wholesale (not just the converted-file allowlist). |
| `mobile:bundle`, `typecheck:solid` CI gates | **KEEP.** |
| "Approach C" / framework-agnostic shared reactive core | **SUPERSEDED.** Do not continue it. `CommunityMessageNexus` is **not** to be ported into bindings. |

**Nothing valuable is lost:** the pure-logic extraction was the right half of the old work
and it survives. The dual-binding / shared-reactive-store half was the wrong half — it was
the tax of sharing a cache across frameworks — and it stops here.

---

## §6 — Guardrails & gates (must stay green)

- **`check:shared-portable`** — `packages/shared` imports no `react`/`solid-js`/`react-flavored
  zustand`. *Strengthen* this to cover all of `packages/shared` (currently an append-as-you-go
  allowlist) once the reactive classes have moved out.
- **`mobile:typecheck`** — mobile types clean.
- **`mobile:bundle`** — headless `expo export`; proves mobile's whole module graph resolves +
  transforms (catches a broken move before it ships). Runs in CI (`.github/workflows/ci.yml`).
  *Known limit:* it only fails on a **total** resolution break; single-layer alias drift is
  masked because Expo Metro resolves via `tsconfig` paths (recorded finding). Pair with
  typecheck.
- **`typecheck:solid`** — `tsc -p apps/tauri/tsconfig.json`; the honest pre-app gate for the
  Solid side.
- **`test:unit`** — includes the nexus/domain tests; keep green through every relocation.

Verification discipline: **never trust a piped exit code** (`… | tail` returns tail's status,
not the command's). Redirect to a file and check the real `$?`.

---

## §7 — Explicitly NOT in this phase

- Building screens, features, or the Solid app UI on the new structure.
- Designing the Tauri desktop shell / web shell beyond what's needed to host a cache.
- Touching mobile's *features* (only its data layer's plumbing, gated).
- Any "make it pretty" pass on transitional React desktop (`web-client`/electron/web) — it's
  scaffolding that Solid replaces; keep it building, nothing more.

The app build is the **next** phase. It starts only when §4 is done and the gates in §6 are
green on a cleaved `packages/shared`.

---

## §8 — Next concrete step

**Cleave exit criteria met** (see §6 gates). The data/cache phase is done.

**Next phase (app build — handoff §7):**
1. Flesh out Solid-native cache I/O in `packages/solid-client/src/data/` (stubs → real backends).
2. Wire `createSolidHavenCore` (or equivalent) and start Tauri/Solid UI on the cleaved structure.
3. Relocate remaining React host layer from shared (`AuthContext`, voice hooks, `Nexus.ts` base).

**Optional cleanup (non-blocking):** move shared nexus integration tests to `apps/mobile` or
`tooling/test-support` so `packages/shared` has zero `@mobile-data` imports even in tests.

Reference inventory (complete): **`docs/messages-cleave-inventory.md`** — template used for all domains.

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
