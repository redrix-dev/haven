# Haven docs

Small on purpose — a handful of living documents plus one detailed-contract folder.

## Reading order (cold start)

1. [PRINCIPLES.md](./PRINCIPLES.md) — how decisions get made here. Read first; everything else follows from it.
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — the current truth: monorepo map, the three-layer law, guardrails and gates.

## Shipping

- [RELEASE_CADENCE.md](./RELEASE_CADENCE.md) — the three release trains, version semantics, branch workflow, and standard + hotfix paths per platform.
- [releases/](./releases/) — one file per release tag; the public release-notes source.

## Detailed contracts (`architecture/`)

- [HAVEN_CORE.md](./architecture/HAVEN_CORE.md) — the data-layer contract: core, caches/nexuses, host boundaries, enforcement. The Solid core mirrors it.
- [SOLID_CLIENT_SHAPE.md](./architecture/SOLID_CLIENT_SHAPE.md) — the desktop/web client's shape law: feature slices, routes, layering boundaries.
- [REALTIME.md](./architecture/REALTIME.md) — the realtime event contract and coverage matrix.
- [nexus-framework.html](./architecture/nexus-framework.html) — standalone visual walkthrough of the Nexus architecture (open in a browser).

## Rules for these docs

- **A living doc is updated in the same change that invalidates it.** A doc that
  describes a world that no longer exists is worse than no doc.
- **When work completes or a plan is superseded, the doc leaves** — git history
  keeps the record, not a pile of stale files.
- **Don't add a new top-level doc for something an existing one should cover.**
  New doc = new thing a reader must know exists. The bar is high.
