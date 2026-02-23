# Haven

Haven is a desktop community chat app built with Electron.

The goal is simple. Keep the parts people actually love about community chat, cut the bloat, and keep the system understandable enough that anyone can inspect how it works.

## Why this exists

I wanted a Discord-like app that feels focused again.

- Fast text chat
- Server scoped roles and permissions
- Clear ownership and moderation controls
- Voice channels that work in a practical MVP setup

This project started as a personal build to prove that a modern chat app can still be clean, predictable, and user respectful. Given the latest information about Discords plan for age verification and identity tracking. I chose to prove to myself mainly, that an alternative could be built.

## Why I built it this way

- SQL first schema design so behavior is explicit and reviewable
- Role and permission model scoped to each server
- RLS policies as the core access control layer
- Realtime where it matters, not everywhere
- P2P voice first for MVP, with a clear path to SFU later

I care more about correctness and trust than fancy abstractions.

## Stack

- Electron Forge
- React + TypeScript
- Tailwind + shadcn/ui components
- Supabase (Auth, Postgres, Realtime, Edge Functions)
- WebRTC for voice transport
- Xirsys TURN for relay support when direct P2P is not possible

## Safety and trust model

No app is "trust me" safe by default, so Haven is built to be inspectable.

- Client uses Supabase publishable key only
- Service role key is not shipped in the renderer
- RLS policies are defined in SQL migrations and versioned in this repo
- Voice relay secrets stay in Supabase Edge Function secrets, not in client code
- Schema, permission logic, and migrations are committed and readable

## How to verify it yourself

1. Review client auth/data usage in `src/lib/supabase.ts` and backend seam files in `src/lib/backend/`.
2. Review access control logic in `supabase/migrations/`.
3. Review voice secret handling in `supabase/functions/voice-ice/index.ts`.
4. Run the app against your own Supabase project and inspect network calls in devtools.

## Current status

Haven is early and actively evolving. The focus right now is MVP completeness, permission correctness, and stable desktop updates.

## Local development

Haven supports two practical local workflows:

1. Code + UI work (no hosted backend access required)
2. Full backend/runtime work with a compatible Supabase project and required secrets

If you do not have a shared backend setup, you can still:
- run packaged builds
- run the local Supabase-backed test harness (for DB/RLS/backend tests)

See:
- `docs/collaborator-setup.md` (small-team collaborator setup + secrets guidance)
- `docs/haven-workflow.md` (end-to-end dev and release workflow)

## Local testing (Phase 5 hardening pass)

Haven now includes a local Supabase-backed regression harness for SQL/RLS and backend seam tests.

Quick prerequisites (details in docs):
- Docker Desktop running (Windows: WSL2 required)
- `psql` installed (PostgreSQL client)
- `npm ci`
- `npx supabase start`

Setup/help docs:
- `docs/collaborator-setup.md` (collaborator-focused setup + secrets handling)
- `docs/testing/rls-and-hardening-runbook.md` (operational runbook)
- `docs/testing/test-suite-breakdown.md` (how the suite works end-to-end)

Core commands:

```bash
npm run test:db
npm run test:backend
npm run test:unit
```

Coverage summary:
- `test:db` -> SQL RLS/RPC regression suites via `psql` against local Supabase
- `test:backend` -> backend seam contract/integration tests against local Supabase
- `test:unit` -> minimal renderer/component tests for notification/DM UX flows

Additional testing docs:
- `docs/testing/hardening-audit.md`

You can also generate a local proof report (with logs + a human-readable learning breakdown):

```bash
npm run test:report
```

Outputs are written to git-ignored `test-reports/*.local/`.

## Packaged renderer parity (embedded media)

Haven now uses a unified loopback HTTP renderer entry origin in both dev and packaged builds to keep
embedded video provider behavior (for example YouTube embeds) consistent across environments.

Important rollout note:
- Existing packaged users may need to sign in once again after upgrading to the parity refactor build,
  because packaged renderer storage moves from a `file://` origin to a fixed local HTTP origin.

Architecture doc:
- `docs/architecture/renderer-entry-origin-parity.md`

## Documentation map

Use this repo as a doc hub, not just a README.

- `docs/haven-workflow.md`
  - End-to-end daily dev + release workflow (branches, commits, versioning, publish, hotfixes)
- `docs/collaborator-setup.md`
  - Small-team collaborator setup, prerequisites, and secrets/environment handling
- `docs/AGENTS.md`
  - Repo-wide engineering and safety rules
- `docs/auto-updates.md`
  - Auto-update behavior and publish notes
- `docs/testing/rls-and-hardening-runbook.md`
  - Operational runbook for local Supabase-backed DB/RLS/backend tests
- `docs/testing/test-suite-breakdown.md`
  - How the test stack works and how to read generated test reports
