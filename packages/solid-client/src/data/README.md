# `data/` — Solid-native cache layer

This is the **per-platform cache** for the Solid (Tauri desktop + web) app. It is
one of the three layers from the cleave (see `docs/solid-migration-handoff.md`):

```
packages/shared (pure logic) → THIS (Solid cache) → solid-client UI
```

Caches here **hold entities reactively and notify the UI**. They call pure
functions in `@shared` for all real thinking (fetch/merge/filter/paginate). They
never duplicate that logic, and they are never shared with mobile's React cache.

## Per-domain folder shape

Each domain folder follows the same three-file shape:

```
data/<domain>/
  <domain>SolidCache.ts   the cache: holds a Solid store, exposes load/clear/upsert,
                          calls @shared logic. Class is `<Domain>SolidCache`.
  accessors.ts            reactive read selectors for the UI, e.g.
                          `createChannels(cache, () => communityId)` →
                          `Accessor<HavenChannel[]>`, built via createStoreSelector
                          over pure @shared selectors.
  index.ts                barrel: re-exports the cache + its accessors.
```

**`accessors.ts` is added when a UI screen first needs to read that domain.** A
domain without one isn't broken or inconsistent — its reactive read layer just
hasn't been needed yet. (This mirrors mobile's "selector-hooks as needed.")

## Naming conventions

- **Files:** camelCase (`channelSolidCache.ts`), matching the folder's full name —
  no abbreviations (`directMessageSolidCache.ts`, not `dm…`).
- **Classes:** PascalCase with a `SolidCache` suffix (`ChannelSolidCache`).
- **Folders:** match mobile's domain names for cross-platform parity.

## The `communities/` vs `community-management/` split

Two community-related folders, deliberately distinct (mirrors mobile):

- **`communities/`** — the community **entity-list** cache (`CommunitySolidCache`):
  which communities the user is in, active id, display order.
- **`community-management/`** — community **governance** caches: admin
  (roles/members/settings) + moderation (modmail inbox). Not the entity list.

## Shared store primitives (at `data/` root)

- `fromStore.ts` / `solidReadableStore.ts` — the Solid reactivity primitives
  (`createStoreSelector`, etc.) every cache + accessor builds on.

## Wiring

Caches are constructed and owned by `core/HavenSolidCore.ts` (the session
composition root). The UI reads them through `accessors.ts`, never by reaching
into a cache's store directly.
