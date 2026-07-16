---
name: haven-supabase-rls
description: Use when changing Supabase migrations, Postgres RLS policies, security-definer RPCs, database triggers, realtime broadcasts, Edge Functions, SQL fixtures, SQL/RLS tests, backend contract tests, or Supabase generated types.
---

# Haven Supabase RLS

## Read Before Editing

- [docs/PRINCIPLES.md](../../../docs/PRINCIPLES.md), especially "Security lives in the
  database"
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
- [supabase/tests/README.md](../../../supabase/tests/README.md)
- [docs/architecture/REALTIME.md](../../../docs/architecture/REALTIME.md) when changing
  private-user broadcasts or realtime-visible rows

## Security Rule

The client reflects what the database permits. It does not decide access.

- Permission checks belong in RLS policies or security-definer RPCs.
- The anon key is public by design.
- Service-role secrets never ship to renderer/mobile/web clients.
- Edge Functions must validate the caller's JWT and domain access before
  returning privileged data such as voice tokens.

## Migration Discipline

- Add a new timestamped migration in `supabase/migrations/`.
- Do not rewrite committed migrations unless the task is an explicit schema
  reset.
- Keep RLS policy changes and tests in the same PR.
- For new RPCs, check grants. Revoke broad/default access first, then grant the
  intended roles.
- For new tables or private broadcasts, decide replica identity and realtime
  publication deliberately.
- Update backend contract types and generated Supabase types with
  `npm run supabase:types` when schema shape changes.

## Test Discipline

The SQL suite runs against local Supabase via `psql`.

- `npm run test:db` resets local DB, bootstraps auth users, loads fixtures, and
  runs the SQL suite.
- `npm run test:db:rls` assumes local Supabase is running and runs helpers,
  fixtures, and SQL.
- `npm run test:db:quick` assumes fixtures are already loaded.
- `npm run test:backend` runs backend seam contract/integration tests.
- Use `npm run test:ci` for DB/shared/backend behavior before signoff.

## Where Tests Go

- Deterministic reusable data:
  `supabase/tests/fixtures/`
- Assertion/auth helper functions:
  `supabase/tests/_helpers/`
- RLS/RPC regression suites:
  `supabase/tests/sql/`
- Backend client contract tests:
  `packages/shared/src/lib/backend/__tests__/`

## Realtime Changes

1. Make the SQL trigger/broadcast emit the exact payload the client needs.
2. Route the event in `packages/shared/src/core/routeRealtimeEvent.ts`.
3. Extend `RealtimeMutationTarget` only when a new platform-core mutation surface
   is necessary.
4. Update [docs/architecture/REALTIME.md](../../../docs/architecture/REALTIME.md).
5. Cover the SQL behavior and the TypeScript routing behavior.

## Footguns

- A green UI test does not prove access control. RLS tests do.
- A direct client filter is not security.
- A helper or fixture change is part of the integration test input surface; CI
  intentionally runs DB/backend lanes for those paths.
- Generated local Supabase files under `.temp/` and `.generated/` are not source
  artifacts.
