# Test Suite Breakdown

## Purpose
Explain Haven's current test stack end-to-end:
- what each test layer validates
- the expected execution order
- how local Supabase fits into the flow
- how to generate an auditable local test report with saved logs

## High-Level Layers

### 1. Static checks
- `npm run lint`
- `npx tsc --noEmit --project tsconfig.json`

These catch code-quality and typing regressions before runtime tests.

### 2. Renderer / component tests (Vitest)
- `npm run test:unit`

Covers targeted UI regressions (notifications, DM UI, menu interactions, etc.) without full Electron e2e.

### 3. DB / RLS SQL suite (local Supabase + `psql`)
- `npm run test:db`
- or `npm run test:db:rls` (SQL suite only)

This is the authoritative security/correctness layer for:
- RLS policies
- SQL RPC behavior
- friend/DM/notification/moderation authorization paths
- mention trigger notification behavior

### 4. Backend seam contract tests (Vitest + local Supabase)
- `npm run test:backend`

Validates TypeScript backend seams against a real local Supabase API using deterministic fixture users.

## End-to-End Flow (Local)

### Recommended full flow
1. `npx supabase start`
2. `npm run test:db`
3. `npm run test:backend`
4. `npm run test:unit`
5. `npm run lint`
6. `npx tsc --noEmit --project tsconfig.json`

### CI-parity flow (repo scripts)
- `npm run test:ci`

This aggregates:
- lint
- typecheck
- unit tests
- DB suite
- backend contract tests

## What `npm run test:db` actually does

`npm run test:db` runs `scripts/test/run-db-suite.mjs`, which performs:
1. `supabase db reset --local`
2. `node scripts/test/bootstrap-local-auth-users.mjs`
3. `node scripts/test/run-supabase-sql-suite.mjs`

### SQL suite structure
- `supabase/tests/_helpers/*`
  - assertions, JWT claim helpers, fixture lookup, cleanup utilities
- `supabase/tests/fixtures/*`
  - seeded shared test data / cleanup setup
- `supabase/tests/sql/*`
  - domain suites (`01` core, `02` notifications, `03` social, `04` DMs, `05` moderation, `06` mentions)

## What `npm run test:backend` actually does

`npm run test:backend` runs `scripts/test/run-vitest-with-local-env.mjs backend`, which:
1. resolves local Supabase env (`supabase status -o env`)
2. injects anon/service-role keys and `POSTGRES_URL` into the test process
3. runs backend contract test files one at a time
4. resets social/DM/notification fixture state between backend test files

Backend contract tests also reset fixture domain state before each test for isolation.

## Local Supabase vs Hosted Supabase (Important)

- Hosted Supabase = real app environments (dev/staging/prod)
- Local Supabase = disposable test runtime for destructive resets + RLS/contract testing

Local test harness config (like `supabase/config.toml`) does **not** change hosted behavior.

If you are onboarding as a real collaborator (shared envs/secrets, local prereqs), start with
`docs/internal/contributor/collaborator-setup.md` before this doc.

## Automated Local Test Report (Generated Logs + Summary)

### Command
```bash
npm run test:report
```

### What it does
- runs the full local CI-style sequence step-by-step:
  - lint
  - typecheck
  - unit tests
  - DB suite
  - backend contract tests
- captures stdout/stderr for each step
- writes a markdown summary report + raw logs under a git-ignored folder

### Output location
- `test-reports/<timestamp>.local/report.local.md`
- raw logs in the same folder (`*.log`, `*.stdout.log`, `*.stderr.log`)

### Why this is useful
- proof/record of what ran and what passed/failed
- easier CI debugging (compare local logs to Actions logs)
- learning aid (you can inspect each layer's output in order)

## Example Report Contents (Generated)

A generated report includes:
- environment snapshot (branch, commit, node/npm/supabase/psql versions)
- local Supabase status (`supabase status -o env`, keys redacted)
- per-command pass/fail summary table
- duration per step
- output excerpts
- links to raw saved logs

## Troubleshooting Notes

### `supabase db reset --local` fails with 502 after migrations
Known local Supabase flake (post-reset service health check race). Try:
1. `npx supabase stop`
2. `npx supabase start`
3. rerun `npm run test:db`

### Windows Docker + WSL setup
Local Supabase requires Docker daemon running. On Windows, ensure:
- WSL2 is installed
- Docker Desktop is running
- `docker version` shows both Client and Server

### `psql` missing
Install PostgreSQL client tools and confirm:
```bash
psql --version
```

## Files to Know
- `scripts/test/run-db-suite.mjs`
- `scripts/test/run-supabase-sql-suite.mjs`
- `scripts/test/bootstrap-local-auth-users.mjs`
- `scripts/test/resolve-supabase-local-env.mjs`
- `scripts/test/run-vitest-with-local-env.mjs`
- `scripts/test/generate-test-report.mjs`
- `test/setup/supabaseLocal.ts`
- `supabase/tests/_helpers/*`
- `supabase/tests/fixtures/*`
- `supabase/tests/sql/*`
