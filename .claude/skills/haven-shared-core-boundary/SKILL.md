---
name: haven-shared-core-boundary
description: Use when changing packages/shared, backend clients, shared domain logic, the collections, HavenCore and its realtime event table, platform ports, persistence ports, themes, or any code that crosses mobile/Solid/web boundaries.
---

# Haven Shared Core Boundary

## Read Before Editing

- [docs/PRINCIPLES.md](../../../docs/PRINCIPLES.md)
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
- [docs/architecture/COLLECTIONS.md](../../../docs/architecture/COLLECTIONS.md)
- [docs/architecture/REALTIME.md](../../../docs/architecture/REALTIME.md) when routing,
  subscriptions, notifications, messages, DMs, social, moderation, or profile
  events change.

## The Law

`packages/shared` is portable logic and contracts only.

- Allowed: pure domain functions, backend interfaces/clients, shared types,
  framework-free selectors, the collections and `HavenCore`,
  `zustand/vanilla`, persistence ports, platform ports, theme token sources.
- Forbidden: React, Solid, React Native, DOM assumptions in portable paths,
  `createClient` call sites outside host bootstrap, direct env reads for
  Supabase config, and hook-shaped `use*` exports under `shared/core`.

Share the logic, not the memory. Every collection's logic lives once in
shared and reads/writes through a `StatePort`; the reactive store behind that
port is always the platform's own (a Solid store or a Zustand store), made by
its core's `makePort`.

## Put Code In The Canonical Home

- Backend clients, RPC wrappers, and network shapes:
  `packages/shared/src/lib/backend/` — one client per DATABASE.md area,
  composed by `createBackend(client)`. Records keep the database's field
  names (`records.ts`); every failure is a `HavenError` with the database's
  reason word; realtime is one topic per person (`realtime.ts`,
  `HavenEventMap` lists every event).
- Supabase client construction:
  `packages/shared/src/lib/createHavenSupabaseClient.ts`
- Domain logic:
  `packages/shared/src/features/<domain>/`
- Collections, their selectors, and the kit (StatePort, requests, events,
  device copies): `packages/shared/src/collections/` (COLLECTIONS.md)
- The session, and the realtime event table:
  `packages/shared/src/collections/core/havenCore.ts`
- Device storage ports and the link pipeline:
  `packages/shared/src/core/persistence/`, `core/linkPipeline.ts`
- Render-ready view models both apps use (no store, no framework):
  `packages/shared/src/features/<domain>/` (e.g. `messageViewModel`)
- Platform capability port:
  `packages/shared/src/infrastructure/platform/appHost.ts`
- Theme token source:
  `packages/shared/src/themes/`

Do not create a second implementation. If a temporary import path must exist, it
is a one-line shim with an expiry, not a copy.

## Data-Layer Change Recipe

1. Put the behavior in the shared collection (or `HavenCore` when it spans
   collections). Platforms only make stores and read them; a behavior change
   written in a platform is a second implementation.
2. Add or update backend interfaces before UI call sites.
3. Add a collection or HavenCore command for UI writes. Do not let UI import
   backend factories or call Supabase directly.
4. A new realtime event is one row in `eventTable()` in `HavenCore`, applied
   to the collections; add it to REALTIME.md's table.
5. Add a selector when both platforms read the same view.
6. Update architecture docs in the same change if the contract changed.

## Guardrails

- `npm run check:shared-portable`
- `npm run check:shared-hex`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:cleave` before merging shared changes
- `npm run test:db` and `npm run test:backend` when backend/RLS behavior or
  backend contracts changed

## Footguns

- Path aliases are mirrored across tsconfig, Metro, Babel, and Vitest. Do not
  add or change one alias in isolation.
- The shared selector home is not fully normalized yet. Follow the domain's
  existing imports; save selector relocation for an explicit cleanup.
- The client anon key is public by design. Service-role behavior belongs only in
  trusted Supabase/server contexts.
