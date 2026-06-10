# Haven docs

Small on purpose. Five living documents, one detailed-contract folder, one archive.

## Reading order (cold start)

1. [PRINCIPLES.md](./PRINCIPLES.md) — how decisions get made here. Read first; everything else follows from it.
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — the current truth: monorepo map, the three-layer law, guardrails and gates.
3. [SOLID_REBUILD.md](./SOLID_REBUILD.md) — the active plan: what's done, what's next, standing decisions.
4. [BACKLOG.md](./BACKLOG.md) — known debt and worked-out future designs, each with its trigger.

## Detailed contracts (`architecture/`)

- [HAVEN_CORE.md](./architecture/HAVEN_CORE.md) — the mobile data-layer contract: `HavenReactCore`, caches, selector-hooks, host boundaries, enforcement. The Solid core mirrors this contract.
- [REALTIME.md](./architecture/REALTIME.md) — the realtime event contract and coverage matrix.
- [nexus-framework.html](./architecture/nexus-framework.html) — standalone visual walkthrough of the Nexus architecture (open in a browser).

## Rules for these docs

- **A living doc is updated in the same change that invalidates it.** A doc that
  describes a world that no longer exists is worse than no doc.
- **Finished or superseded work moves to [`_archive/`](./_archive/) intact** —
  history is kept, never rewritten. Archived files may contain stale paths and
  claims; that's expected, they're records.
- **Don't add a new top-level doc for something an existing one should cover.**
  New doc = new thing a reader must know exists. The bar is high.
