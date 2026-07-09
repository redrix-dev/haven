---
name: haven-solid-nexus
description: Use when adding, converting, or changing Solid data nexuses/caches under packages/solid-client/src/data, HavenSolidCore wiring, Solid store projections, Solid realtime cache mutations, or data-layer tests.
---

# Haven Solid Nexus

## Read Before Editing

- [packages/solid-client/src/data/README.md](../../../packages/solid-client/src/data/README.md)
- [packages/solid-client/src/data/NEXUS_RECIPE.md](../../../packages/solid-client/src/data/NEXUS_RECIPE.md)
- [packages/solid-client/src/data/channels/channelSolidNexus.ts](../../../packages/solid-client/src/data/channels/channelSolidNexus.ts)
- [docs/architecture/HAVEN_CORE.md](../../architecture/HAVEN_CORE.md)

## Shape

Each domain owns one `XxxSolidNexus`:

```text
packages/solid-client/src/data/<domain>/
  <domain>SolidNexus.ts
  index.ts
```

- File names are camelCase and use the full domain name.
- Classes are PascalCase with a `SolidNexus` suffix.
- Folder names mirror mobile domain names when the domain exists on both
  platforms.
- `HavenSolidCore` constructs and owns the nexus.

## Non-Negotiable Store Rules

- Use Solid `createStore` directly.
- Read through projection methods that return tracked values or `createMemo`
  accessors.
- Write through named methods only.
- Use path-based `setState("slot", key, value)` for mutations.
- Keep `setState` private.
- Never expose mutable store writers to UI.
- Never spread a store proxy into a snapshot for reactive reads.
- Never add `wireSolidReadableStore`, `fromStore`, manual `notify()`,
  subscribe/tick scaffolding, equality wrappers, or revision increments.

## Conversion Or Addition Procedure

1. Scout the full public surface before editing:
   - Feature usage under `packages/solid-client/src/features`
   - `HavenSolidCore` calls
   - `RealtimeMutationTarget` required method names
   - Existing mobile nexus names for parity
2. Preserve public method names expected by core/realtime contracts.
3. Move pure projection logic to `@shared` when the logic must match mobile.
4. Keep backend access behind injected backend interfaces.
5. Add lifecycle methods (`load`, `ensureLoaded`, `rehydrate`, `clear`) only when
   the domain actually needs them.
6. Add tests beside the domain when projections, persistence, realtime patching,
   or ordering behavior can regress.

## Validation

- `npm run typecheck:solid`
- `npm run lint`
- `npx vitest run packages/solid-client/src/data/<domain>` for domain tests
- `npm run test:unit` before handoff if shared/mobile contracts are touched

## Footguns

- Solid's Node test environment needs the Vitest alias forcing `solid-js` to the
  reactive dev build. Do not remove that alias while Solid data tests exist.
- `revision` may appear in shared state types. Initialize it if the type requires
  it; do not use it for Solid reactivity.
- Do not add a Solid cache to `packages/shared`. The cache is platform memory.
