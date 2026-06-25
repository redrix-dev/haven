# `data/` — Solid-native cache layer

This is the **per-platform cache** for the Solid (Tauri desktop + web) app. It is
one of the three layers of the architecture (see `docs/ARCHITECTURE.md`):

```
packages/shared (pure logic) → THIS (Solid cache) → solid-client UI
```

Each domain owns a **nexus**: a class that holds a Solid `createStore` proxy,
exposes reactive projections + named writes, and calls pure functions in
`@shared` for all the real thinking (fetch/merge/filter/paginate). Nexuses never
duplicate that logic, and they are **never shared with mobile's React/Zustand
cache** — the Solid client is deliberately cleaved from mobile so its state layer
can use Solid's native fine-grained reactivity instead of imitating Zustand.

## The nexus pattern (read this first)

A Solid `createStore` proxy **is** the reactive source. There is no subscribe /
notify / tick / revision machinery — you read fields in a tracking scope
(component / `createMemo` / `createEffect`) and that subscribes to exactly those
fields; you write with path-based `setState(...)` and the readers of touched
fields re-run.

```
data/<domain>/
  <domain>SolidNexus.ts   the nexus: holds the store, exposes reactive
                          projection methods (createMemo over `this.state`) +
                          named write/lifecycle methods, calls @shared logic.
                          Class is `<Domain>SolidNexus`.
  index.ts                barrel: re-exports the nexus class + its factory.
```

The full step-by-step is in [`NEXUS_RECIPE.md`](./NEXUS_RECIPE.md).
`channels/channelSolidNexus.ts` (+ [`channelSolidNexus.md`](./channels/channelSolidNexus.md))
is the worked template; `onboarding/onboardingSolidNexus.ts` read directly by
`OnboardingGate` (`onboarding.state.campaigns`) is the gold-standard example of a
component consuming a nexus.

### The one rule

Read through the projection methods, write through the named methods. **Never**
expose `setState`, never let a caller mutate `state` directly, and never:

- `wireSolidReadableStore`, `fromStore`, `createStoreSelector`, manual `.notify()`,
  or any Zustand-shaped `subscribe` / tick hook;
- **spreading the proxy into a new object** (`{ ...state }` snapshots it and kills
  tracking — this is the bug that historically forced the whole notify/subscribe
  scaffold back in);
- reading or incrementing `revision` counters — they are vestigial, existing only
  in the shared `NexusState` type for mobile.

## Naming conventions

- **Files:** camelCase matching the folder's full name, no abbreviations
  (`directMessageSolidNexus.ts`, not `dm…`).
- **Classes:** PascalCase with a `SolidNexus` suffix (`ChannelSolidNexus`).
- **Folders:** match mobile's domain names for cross-platform parity.

## The `communities/` vs `community-management/` split

Two community-related folders, deliberately distinct (mirrors mobile):

- **`communities/`** — the community **entity-list** nexus (`CommunitySolidNexus`):
  which communities the user is in, active id, display order.
- **`community-management/`** — community **governance** nexuses: admin
  (roles/members/settings) + moderation (modmail inbox). Not the entity list.

## `session/`

Session-scoped stores (auth, ui, user status, viewer message policy) live in
`session/`. These expose `getState()` returning the **live store proxy** (read
its fields in a tracking scope — same rule as a nexus). A store may keep a no-op
`subscribe` **only** to satisfy a shared cross-platform contract mobile also
implements (e.g. `ViewerMessagePolicyStore`'s `ReadableStore` type) — Solid still
reads the proxy directly and never calls it.

## Wiring

Nexuses are constructed and owned by `core/HavenSolidCore.ts` (the session
composition root), which also implements the typed `RealtimeMutationTarget`
contract from `@shared/core/realtimeMutationTarget.ts`. The UI reads nexuses
through their projection methods, never by reaching into a nexus's store directly.
