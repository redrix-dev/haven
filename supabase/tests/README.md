# Supabase SQL / RLS Test Suite

This directory contains the SQL-first RLS and RPC regression suite for Haven.

## Execution model
- Run against a **local Supabase stack**
- Execute via `psql`
- Use helper functions for assertions and auth/JWT impersonation
- Use deterministic fixture users bootstrapped via `scripts/test/bootstrap-local-auth-users.mjs`

## Common commands
- `npm run test:db` — reset local DB, bootstrap auth users, load fixtures, run SQL suite
- `npm run test:db:rls` — run helpers + fixtures + SQL suite (assumes local stack is running)
- `npm run test:db:quick` — run helpers + SQL suite only (assumes fixtures already loaded)

## Directory layout
- `_helpers/` — assertion helpers, auth claim helpers, fixture lookup helpers
- `fixtures/` — baseline deterministic fixture data shared by SQL + backend tests
- `sql/` — domain suites (core permissions, notifications, social, DMs, moderation, mentions)

## Notes
- Tests use `SET LOCAL ROLE ...` + `request.jwt.claim.*` settings to exercise RLS.
- Most suites run inside `BEGIN; ... ROLLBACK;` so data changes do not persist.
- Fixture files are idempotent and safe to re-run on a local dev DB.

