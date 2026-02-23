# RLS and Hardening Test Runbook

## Purpose
Operational runbook for running Haven's local Supabase-backed hardening and regression suites:
- SQL RLS/RPC tests (`psql`)
- backend seam integration tests (local Supabase)
- minimal renderer/component unit tests

## Current Design
- Local Supabase stack is the runtime (`supabase start`)
- DB reset uses migrations in repo (`supabase db reset --local`)
- Deterministic auth users are created via Auth Admin API script
- SQL suites run through `psql` against local Postgres
- Backend contract tests use the real local Supabase HTTP API and anon/service-role keys

Note:
- This runbook covers DB/RLS/backend regression testing only.
- It is separate from Electron renderer-origin parity work (packaged vs dev embed behavior), which is
  documented in `docs/architecture/renderer-entry-origin-parity.md`.

## Trust Boundary
- RLS/permission checks are validated in DB, not mocked in tests
- Backend seam tests use real RPC/table access paths with real auth sessions
- Service-role usage is restricted to fixture bootstrap/setup helpers and privileged checks

## Local Setup
Prereqs:
- Docker running
- Supabase CLI installed
- `psql` installed (PostgreSQL client)
- `npm ci` completed

## Core Commands

### Full local DB reset + fixture + SQL suite
```bash
npm run test:db
```

### Bootstrap local auth users only
```bash
npm run test:db:users
```

### Load helpers + fixtures only (no assertions)
```bash
npm run test:db:fixtures
```

### Run SQL RLS suite (includes helpers + fixtures)
```bash
npm run test:db:rls
```

### Quick SQL run (helpers + assertions only; assumes fixtures already loaded)
```bash
npm run test:db:quick
```

### Backend seam integration tests (local Supabase env auto-resolved)
```bash
npm run test:backend
```

### Minimal renderer/component tests
```bash
npm run test:unit
```

### CI-parity aggregate
```bash
npm run test:ci
```

## Recommended Local Flow (Feature Work)
1. `supabase start`
2. `npm run test:db`
3. `npm run test:backend`
4. `npm run test:unit`
5. `npm run lint`
6. `npx tsc --noEmit --project tsconfig.json`

## SQL Suite Structure
- `supabase/tests/_helpers/*`
  - assertions
  - JWT claim helpers
  - fixture lookup helpers
  - cleanup utilities
- `supabase/tests/fixtures/*`
  - shared test community/users/roles/channels/staff rows
- `supabase/tests/sql/*`
  - domain suites (core permissions, notifications, social, DMs, moderation, mentions)

## Adding a New RLS/RPC Test
Checklist:
1. Add or reuse fixture data in `supabase/tests/fixtures/*`
2. Add assertions in the relevant `supabase/tests/sql/*.sql` suite
3. Use `SET LOCAL ROLE ...` plus `test_support.set_jwt_claims(...)`
4. Prefer `BEGIN; ... ROLLBACK;` for isolated scenarios
5. Add a backend seam contract test if UI/backends depend on the behavior
6. Document behavior changes in relevant architecture docs

## Failure Modes / Troubleshooting
- `Fixture auth user missing ...`
  - Run `npm run test:db:users`
- `Fixture community not found`
  - Run `npm run test:db` or `npm run test:db:fixtures`
- `supabase status -o env` fails
  - Ensure local stack is running (`supabase start`)
- `psql` not found
  - Install PostgreSQL client tooling

## Extension Path
- Add more SQL suites as new RLS domains ship
- Add richer backend contract coverage per seam
- Add Electron e2e tests later (separate workflow)
- Add load/realtime stress testing as the user base grows

## Files to Know
- `scripts/test/resolve-supabase-local-env.mjs`
- `scripts/test/bootstrap-local-auth-users.mjs`
- `scripts/test/run-supabase-sql-suite.mjs`
- `scripts/test/run-db-suite.mjs`
- `scripts/test/run-vitest-with-local-env.mjs`
- `supabase/tests/run_order.txt`
