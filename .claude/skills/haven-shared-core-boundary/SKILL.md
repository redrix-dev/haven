---
name: haven-shared-core-boundary
description: Use when changing packages/shared, backend clients, shared domain logic, HavenCore contracts, RealtimeMutationTarget, routeRealtimeEvent, platform ports, persistence ports, themes, or any code that crosses mobile/Solid/web boundaries.
---

# Haven Shared Core Boundary

## Read Before Editing

- [docs/PRINCIPLES.md](../../../docs/PRINCIPLES.md)
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
- [docs/architecture/HAVEN_CORE.md](../../../docs/architecture/HAVEN_CORE.md)
- [docs/architecture/REALTIME.md](../../../docs/architecture/REALTIME.md) when routing,
  subscriptions, notifications, messages, DMs, social, moderation, or profile
  events change.

## The Law

`packages/shared` is portable logic and contracts only.

- Allowed: pure domain functions, backend interfaces/clients, shared types,
  framework-free selectors, `zustand/vanilla`, persistence ports, platform ports,
  theme token sources, realtime routing over typed interfaces.
- Forbidden: React, Solid, React Native, DOM assumptions in portable paths,
  platform caches, `createClient` call sites outside host bootstrap, direct env
  reads for Supabase config, and hook-shaped `use*` exports under `shared/core`.

Share the smarts, not the memory. A reactive store is never shared across React
and Solid.

## Put Code In The Canonical Home

- Backend clients, RPC wrappers, and network shapes:
  `packages/shared/src/lib/backend/`
- Supabase client construction:
  `packages/shared/src/lib/createHavenSupabaseClient.ts`
- Domain logic:
  `packages/shared/src/features/<domain>/`
- Realtime routing:
  `packages/shared/src/core/routeRealtimeEvent.ts`
- Realtime platform contract:
  `packages/shared/src/core/realtimeMutationTarget.ts`
- Persistence ports:
  `packages/shared/src/core/persistence/`
- Pure selectors and entity state types:
  `packages/shared/src/nexus/`
- Platform capability port:
  `packages/shared/src/infrastructure/platform/appHost.ts`
- Theme token source:
  `packages/shared/src/themes/`

Do not create a second implementation. If a temporary import path must exist, it
is a one-line shim with an expiry, not a copy.

## Data-Layer Change Recipe

1. Decide if the change is logic or cache.
   - Logic is data in/data out and belongs in `packages/shared`.
   - Cache holds reactive state and belongs to mobile or Solid data layers.
2. Add or update backend interfaces before UI call sites.
3. Add a HavenCore/cache command for UI writes. Do not let UI import backend
   factories or call Supabase directly.
4. Route new private-user realtime events in `routeRealtimeEvent` by patching,
   evicting, or reloading one primary domain.
5. Extend `RealtimeMutationTarget` only when shared routing genuinely needs a new
   platform-core capability.
6. Update both platform cores/caches when the shared contract changes.
7. Update architecture docs in the same change if the contract changed.

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
- `revision` in shared nexus state is mobile compatibility. Solid code should
  initialize it only.
- The client anon key is public by design. Service-role behavior belongs only in
  trusted Supabase/server contexts.
