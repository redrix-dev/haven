---
name: haven-solid-nexus
description: Use when adding or changing a data nexus — the shared XNexus in packages/shared/src/nexus, its Solid binding (packages/solid-client/src/data) or React binding (apps/mobile/src/data), StatePort or LoadGate behavior, HavenCore parts wiring, nexus projections, or data-layer tests.
---

# Haven Nexus (shared class + bindings)

## Read Before Editing

- [packages/shared/src/nexus/NEXUS_RECIPE.md](../../../packages/shared/src/nexus/NEXUS_RECIPE.md) — the step-by-step
- [packages/solid-client/src/data/README.md](../../../packages/solid-client/src/data/README.md) — how the Solid port behaves
- [packages/solid-client/src/data/channels/channelSolidNexus.md](../../../packages/solid-client/src/data/channels/channelSolidNexus.md) — worked example
- [docs/architecture/HAVEN_CORE.md](../../../docs/architecture/HAVEN_CORE.md)

## Shape

```text
packages/shared/src/nexus/<domain>/xNexus.ts        class XNexus — all logic, over a StatePort
packages/solid-client/src/data/<domain>/xSolidNexus.ts  class XSolidNexus extends XNexus — Solid port + reads
apps/mobile/src/data/<domain>/xReactNexus.ts         class XReactNexus extends XNexus — zustand port + reactiveStore
```

- Logic, loads, commands, persistence: **the shared class only.** A binding
  builds the port and exposes reads; it never adds behavior.
- State types and `createInitialXState()` live in shared. No platform state
  aliases, no `createX` factories — construct with `new`.
- `HavenCore` (shared) owns every nexus; `createSolidParts` /
  `createReactParts` construct the bindings.

## Non-Negotiable Rules

- **No framework imports in `packages/shared`** (`check:shared-portable`).
- **Write immutably through `port.set`**; build the next value from `port.get()`.
- **Initial state from a factory**, never a shared constant (the Solid port
  takes ownership of written values).
- **Rows keyed by something other than `id`** declare it on the Solid port
  (`createSolidStatePort(initial, { keys: { rows: "userId" } })`).
- **Loads go through a `LoadGate`** and check `stale()` after every `await`
  before writing, so a load answering after sign-out can't leak old data. A
  method that drops one key's data (a lost community) calls `gate.forget(key)`
  too, or the load in flight writes it back.
- **Solid consumers never write the store directly** and never spread the
  proxy; they call nexus methods and read `state` / accessors.
- **Solid `get()` is the live proxy**: shared getters are reactive, so an effect
  calling a method that reads and writes must `untrack` it (see
  `haven-solid-reactivity`).

## Procedure

1. Scout the full surface: feature code, `this.<domain>.` in `havenCore.ts`,
   the `RealtimeMutationTarget` interface (it fixes method names), mobile hooks.
2. Change or add behavior in the shared class.
3. Add only the reads each binding needs (Solid accessors; mobile hooks with
   stable fallbacks and an equality fn).
4. New domain: wire `HavenParts`, both `create*Parts`, `clearSession`, and
   `createTestHavenCore`.
5. Test at the right level: shared nexus over `createPlainStatePort`;
   cross-nexus via `createTestHavenCore()`; Solid reactivity in `*.tier2.test.ts`.
   Break what the test guards and confirm it fails.

## Validation

- `npm run typecheck` and `npm run mobile:typecheck`
- `npm run lint`
- `npm run test:unit` (every `*.test.ts` except backend contract tests)
- `npm run test:tier2` when Solid reactivity or effects are involved

## Footguns

- Node vitest aliases `solid-js/store` to its dev build and inlines `solid-js`
  (`vitest.config.ts`); without that, the SSR store has no signals and
  `reconcile` can't shrink arrays. Prove reactivity in tier-2, not node tests.
- Values handed to `port.set` on Solid are morphed in place by `reconcile`; a
  shared constant passed in once is corrupted for every later reader.
- A load that writes after an `await` without checking `stale()` reintroduces
  cross-account bleed on sign-out.
