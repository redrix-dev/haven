---
name: haven-solid-feature-slice
description: Use when adding or changing desktop/web Solid features, routes, popout routes, UI primitives, shell-agnostic bridge usage, or package boundaries under packages/solid-client.
---

# Haven Solid Feature Slice

## Read Before Editing

- [docs/architecture/SOLID_CLIENT_SHAPE.md](../../architecture/SOLID_CLIENT_SHAPE.md)
- [packages/solid-client/src/features/README.md](../../../packages/solid-client/src/features/README.md)
- [packages/solid-client/src/routes/README.md](../../../packages/solid-client/src/routes/README.md)
- [packages/solid-client/src/components/ui/README.md](../../../packages/solid-client/src/components/ui/README.md)

## Layer Law

Dependencies point down only:

| Layer                     | May import                                           |
| ------------------------- | ---------------------------------------------------- |
| `App.tsx`                 | routes, contexts, core, UI primitives, root files    |
| `routes/`                 | feature barrels, contexts, core, UI primitives       |
| `features/*`              | data, UI primitives, contexts, auth, core, `@shared` |
| `contexts/`               | core, auth, data                                     |
| `auth/`                   | core                                                 |
| `core/`                   | data                                                 |
| `data/`, `components/ui/` | `@shared` and Solid only                             |

Anything not allowed is a lint error by design.

## Add Or Change A Feature

1. Put the feature in `packages/solid-client/src/features/<feature-name>/`.
2. Export the public surface from that feature's `index.ts`.
3. Register routes in `packages/solid-client/src/routes/index.tsx`.
4. Keep `App.tsx` untouched unless adding/removing app-wide providers or chrome.
5. Keep shared visual primitives in `components/ui/` only when they have no data
   access and no feature knowledge.
6. Move shared feature logic down into `data/`, `components/ui/`, or
   `packages/shared`; never import one feature from another.

## Shell-Agnostic Rule

`packages/solid-client` must run under Tauri and in a normal browser tab.

- Do not import `@tauri-apps/*` in `packages/solid-client`.
- Add shell capability to `bridge.ts` and implement it in `apps/tauri/src/bridge.ts`
  and the browser/web fallback.
- A popout is a route. Window creation/sizing belongs to `apps/tauri`; the Solid
  app renders whatever route the shell points at.

## Styling

- Use semantic Tailwind utilities such as `bg-card`, `text-foreground`, and
  `bg-surface-panel`.
- Do not use raw primitive token classes like `bg-surface-2` unless the generated
  bridge emits them.
- Use `lucide-solid` for icons when a suitable icon exists.
- Keep UI primitives dumb: props in, JSX out, no core/data imports.

## Validation

- `npm run typecheck:solid`
- `npm run lint`
- `npm run test:unit` when data projections, feature logic, or route behavior
  changed
- `npm run build:solid` when shell/bootstrap/build behavior changed
