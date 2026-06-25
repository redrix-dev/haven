# `features/` — vertical slices

One folder per product feature (community, direct-messages, voice, settings, …),
named to mirror `apps/mobile/src/features/` wherever the domain exists on both
platforms. Full shape + reasoning: [docs/architecture/SOLID_CLIENT_SHAPE.md](../../../../docs/architecture/SOLID_CLIENT_SHAPE.md).

The lint-enforced contract (`boundaries/dependencies` in `eslint.config.mjs`):

- A feature may import `data/`, `components/ui/`, `contexts/`, `auth/`, `core/`,
  and `@shared` — **never another feature**. Shared needs move down a layer.
- A feature is entered from outside **only through its `index.ts` barrel**.
  Everything else in the folder is internal and free to change.
- Internal structure is deliberately unregulated — organize each slice however
  it wants. The boundary is the contract, not the inside.

Adding a feature = new folder here + one registration in `routes/`. If the change
also wants to touch `App.tsx`, something is in the wrong place.
