# Collaborator Setup (Small-Team)

## Purpose
This document is for genuine Haven collaborators (not random public cloners).

It covers:
- local prerequisites
- local Supabase test harness setup
- shared backend/secrets expectations
- what to ask for when onboarding
- what to avoid sharing casually

This is intentionally a small-team setup guide (not a formal access-tier policy).

## Scope
- Day-to-day collaboration setup for code/docs/testing work
- Local test harness requirements (`test:db`, `test:backend`)
- Shared environment/secrets handling basics

Not covered:
- full release workflow (`docs/haven-workflow.md`)
- deep test internals (`docs/testing/test-suite-breakdown.md`)
- DB/RLS runbook details (`docs/testing/rls-and-hardening-runbook.md`)

## First Principle: Local vs Hosted Supabase
- Local Supabase (Docker) is for destructive/repeatable testing.
- Hosted Supabase is for real app runtime environments.

Important:
- `supabase/config.toml` affects local Supabase only.
- Running local DB/RLS/backend tests does not require hosted project secrets.

## What a Collaborator Needs (Minimum)

### Required for most contributors
- Node.js + npm
- repo access
- `npm ci`

### Required for local DB/RLS/backend test runs
- Docker Desktop installed and running
- Supabase CLI (`supabase` or `npx supabase`)
- PostgreSQL client (`psql`) on PATH

### Windows-specific requirements
- WSL2 installed
- virtualization enabled (BIOS/UEFI + Windows virtualization stack)

Quick checks:

```bash
node -v
npm -v
docker version
psql --version
npx supabase --version
```

## Local Test Harness Setup (Collaborator Quickstart)
1. Install prerequisites (`Docker`, `psql`, Node/npm).
2. `npm ci`
3. Start Docker Desktop and wait for it to be healthy.
4. Start local Supabase:

```bash
npx supabase start
npx supabase status -o env
```

5. Run tests:

```bash
npm run test:db
npm run test:backend
npm run test:unit
```

Useful docs:
- `docs/testing/rls-and-hardening-runbook.md`
- `docs/testing/test-suite-breakdown.md`
- `docs/haven-workflow.md`

## Shared Environment / Secrets (Small-Team Guidance)

### What collaborators usually do NOT need
- production service-role keys
- production dashboard owner access
- release publishing credentials/tokens

### What a collaborator may need (depending on work)
- shared dev/staging Supabase project URL + anon/publishable key
- specific app env values for runtime testing against shared backend
- feature-flag enablement help (through the maintainer)

### How to share secrets (recommended)
- use a secure vault or a direct secure handoff method
- avoid pasting secrets in issue comments, commits, screenshots, or chat history that gets reused
- rotate secrets if exposed accidentally

### What to keep out of git
- `.env` files with real secrets
- copied dashboard export dumps containing secrets
- local auth/service tokens

## Onboarding Checklist (Small-Team)
- [ ] Repo access granted
- [ ] Local prerequisites installed (`docker`, `psql`, Node/npm)
- [ ] `npm ci` completed
- [ ] Local Supabase test harness runs (`npx supabase start`, `npm run test:db`)
- [ ] Shared backend access clarified (if needed)
- [ ] Required secrets/env values handed off securely (if needed)
- [ ] Knows where to find process docs (`docs/haven-workflow.md`)

## Offboarding / Access Cleanup (Simple Version)
If a collaborator no longer needs access:
- remove repo access (if applicable)
- revoke/rotate shared secrets they had
- remove shared backend project access (if granted)
- rotate release/publish credentials if they were shared

## Notes for Future You
- This is intentionally lightweight while the team is small.
- If Haven grows beyond a few active contributors, evolve this into a formal access model/policy.
