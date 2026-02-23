# Haven Workflow

## Purpose
This is the day-to-day and release playbook for developing and shipping Haven.

It is the canonical "how I work on Haven" document for:
- picking work
- branching
- implementing changes
- testing and validation
- committing
- versioning
- releasing
- handling hotfixes

It is designed for solo-maintainer use and AI-assisted sessions.

## Audience
- Primary: Haven maintainer (you)
- Secondary: future contributors or collaborators
- Secondary: AI/code assistants that need a clear operational workflow

## What This Covers
- Daily development workflow
- Release workflow (version, tag, push, publish)
- GitHub issue usage and local backlog parity
- Testing workflow (including local Supabase + generated test reports)
- Hotfix workflows (DB-only, client-only, mixed)

## What This Does Not Cover
- Deep architecture design details (see `docs/architecture/*`)
- Repo-wide coding invariants (see `docs/AGENTS.md`)
- Detailed auto-update implementation internals (see `docs/auto-updates.md`)

## Related Docs
- `docs/AGENTS.md`
- `docs/auto-updates.md`
- `docs/collaborator-setup.md`
- `docs/testing/rls-and-hardening-runbook.md`
- `docs/testing/test-suite-breakdown.md`
- `SESSION_HANDOFF.local` (local, git-ignored)

---

## Core Workflow Principles

1. `main` is the release source of truth.
2. Prefer reproducible, logged steps over memory/manual improvisation.
3. DB auth/permissions changes require DB/RLS validation.
4. Electron main/CSP/renderer-entry changes require packaged parity checks (`npm run make` + manual smoke).
5. Release assets are immutable (never replace assets for an existing version/tag).
6. SQL Editor is acceptable for emergencies; long-term target is CLI-managed hosted migrations.
7. Keep local notes (`SESSION_HANDOFF.local`) and GitHub issues in sync, but do not duplicate them blindly.

---

## Track 1: Daily Development Workflow

This is the default "log in, do work, validate, commit, hand off" loop.

### 1. Start-of-Session Checklist

Run this sequence before touching code:

1. Sync your repo state
```bash
git status
git branch --show-current
git fetch --all --prune
```

2. If on a working branch, pull latest base updates when appropriate
```bash
git pull --ff-only
```

3. Review active context
- open GitHub issues (priority + blocked status)
- open `SESSION_HANDOFF.local` (if continuing prior work)
- confirm what "done" means for this session

4. Decide branch strategy for the session
- continue current branch if same scope
- create a new branch if scope changed materially

### 2. Issue Selection and Local Backlog Parity

#### What belongs in GitHub issues
Use GitHub issues for product/problem tracking:
- user-facing problem
- expected behavior
- acceptance criteria
- priority/labels
- blocked status
- screenshots/repro info if useful

#### What belongs in `SESSION_HANDOFF.local`
Use `SESSION_HANDOFF.local` for execution memory:
- implementation notes
- exact commands run
- environment setup status (Docker/WSL/psql, etc.)
- deferred polish
- follow-up ideas not yet promoted to issues
- release notes reminders

#### Recommended parity pattern
- GitHub issue = canonical problem statement
- `SESSION_HANDOFF.local` = execution journal + next-step note
- Reference issue numbers in local notes where relevant
- Promote repeated local TODOs into GitHub issues if they persist or become user-facing

#### Issue closure timing
- Prefer closing issues on merge to `main`
- Avoid closing issues from scratch-branch commits
- If user impact depends on release, optionally close after release validation (or comment "merged, shipping in next patch")

### 3. Branching Strategy (Default)

#### Recommended branch naming
- `feature/<short-topic>`
- `hotfix/<short-topic>`
- `docs/<short-topic>`
- `chore/<short-topic>`

Examples:
- `feature/friends-dm-badge`
- `hotfix/dm-send-rpc-ambiguity`
- `docs/haven-workflow`

#### Scratch branches
Scratch branches are fine for:
- debugging
- large exploratory work
- unstable multi-step changes

But:
- avoid version bumping/tagging/releasing from scratch branches when possible
- prefer merging to `main` first, then version + publish from `main`

#### Release path rule
Build/test anywhere, release from `main`.

### 4. Do the Work (Implementation Loop)

#### Operating rules
- Read before write (align with `docs/AGENTS.md`)
- Keep changes scoped to one coherent goal
- Prefer incremental fixes over broad rewrites unless intentionally redesigning
- Update docs alongside behavior changes when practical

#### Suggested loop
1. Inspect relevant code/docs/migrations
2. Implement small coherent change
3. Run targeted validation
4. Repeat until feature/hotfix is complete
5. Run release-appropriate validation

### 5. Local Validation Tiers (What to Run and When)

Use the smallest meaningful validation set for the change, then expand before merging/releasing.

#### Tier A: Quick checks (most changes)
```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
```

#### Tier B: UI / renderer / DM / notification UX changes
```bash
npm run test:unit
```

#### Tier C: Supabase SQL / RLS / RPC / auth-sensitive changes
Requires local Supabase stack running.
```bash
npm run test:db
npm run test:backend
```

#### Tier D: Electron main / updater / CSP / renderer-entry / media parity changes
```bash
npm run make
```

Then perform packaged smoke checks (manual), especially for:
- embedded media parity
- auth/session persistence after relaunch
- updater checks
- permissions/device access if touched

#### Tier E: Generate a local proof report (recommended before release or after deep fixes)
Full local report:
```bash
npm run test:report
```

DB/backend focused report:
```bash
npm run test:report -- db
```

Outputs (git-ignored):
- `test-reports/<timestamp>.local/report.local.md`
- raw logs in same folder

Notes:
- The report includes a "Learning View" that explains major SQL/backend suites in actor/action/expected terms.
- See `docs/testing/test-suite-breakdown.md` for how the suite works end-to-end.

### 6. End-of-Day Handoff Workflow

Before stopping for the day:

1. Update `SESSION_HANDOFF.local`
- what was completed
- what is deferred/backlogged
- exact next step
- blockers / environment setup status
- release notes reminders if relevant

2. If the work is visible externally, optionally update GitHub issue comments
- current status
- what's merged vs not merged
- known blocker(s)

3. Leave the branch in a recoverable state
- commit if the checkpoint is valuable
- or clearly note what is uncommitted in `SESSION_HANDOFF.local`

---

## Commit Workflow and Commit Message Conventions

### 1. Commit Timing
Commit when:
- a logical unit is working and validated
- a risky checkpoint should be preserved
- you need a clean rollback/split point

Avoid:
- giant "everything changed" commits if the work can be split coherently
- waiting until the end of a long debugging session to commit all fixes at once

### 2. Commit Message Format (Pragmatic Standard)

Use prefix-based commit messages (compatible with a conventional style, but not strict):
- `feat: ...`
- `fix: ...`
- `hotfix: ...`
- `docs: ...`
- `chore: ...`
- `test: ...`
- `refactor: ...`

Examples:
- `hotfix: fix DM send RPC ambiguity and notification prefs update`
- `docs: add Haven workflow playbook`
- `test: stabilize local Supabase backend contract runner on Windows`
- `fix: stop DM read receipt refresh loop spam`

### 3. Issue References in Commits

Use issue references intentionally:
- `Refs #12` for partial progress
- `Closes #12` / `Fixes #12` only when the change truly resolves the issue

Do not:
- close unrelated issues from broad release commits
- use closing keywords for "worked on this area" only

### 4. WIP Commits

WIP commits are allowed locally, especially on scratch branches:
- `WIP: ...`
- `WIP Completed`

Before merging to `main` (if using PR flow):
- prefer cleanup/squash if possible
- if not squashing, make sure the sequence is still readable

---

## GitHub Issues Workflow (Parity with Local TODOs)

### 1. GitHub Issues: Problem Tracking
GitHub issues should answer:
- what is broken/missing?
- who is impacted?
- what is expected?
- what counts as done?

Good content:
- concise description
- repro steps
- acceptance criteria
- labels (`feature`, `hotfix`, priority, `blocked`, etc.)

### 2. `SESSION_HANDOFF.local`: Execution Tracking
Use the local handoff file for:
- implementation progress
- deferred polish
- exact commands run and outcomes
- known local environment setup state
- "tomorrow morning" notes

### 3. Practical Parity Rules
- If local notes mention the same deferred item multiple times, create a GitHub issue
- If a GitHub issue is detailed enough already, local notes should just track execution status and next step
- If a hotfix was applied manually (SQL Editor), record it in local notes and backfill migration context immediately

### 4. Issue Resolution Timing
- Preferred: close when merged to `main`
- Alternative: close after release if the issue is explicitly release-impacting and you want a stronger operational signal

---

## Supabase Workflow (Local Tests vs Hosted DB vs Future CLI Migration Flow)

This section exists because Haven currently uses both:
- local Supabase (Docker) for tests
- hosted Supabase for real app runtime

### 1. Local Supabase (Docker) Usage

#### Purpose
Local Supabase is for destructive/repeatable testing:
- `supabase db reset --local`
- SQL/RLS suite
- backend contract tests

#### Requirements (Windows)
- Docker Desktop running
- WSL2 installed and working
- `psql` installed and on PATH
- `npx supabase start`

If onboarding a real collaborator, start with `docs/collaborator-setup.md` and then use this playbook for workflow/release habits.

#### Common setup checks
```bash
docker version
psql --version
npx supabase --version
npx supabase start
npx supabase status -o env
```

#### Important local-only note
`supabase/config.toml` affects the local Supabase stack only.
It does not change hosted Supabase behavior.

### 2. Hosted Supabase Usage

Hosted Supabase remains the app runtime source of truth.

Current reality:
- some migrations/hotfixes may be applied via SQL Editor (especially emergencies)
- SQL Editor applies do not necessarily reconcile migration history automatically

This is acceptable operationally, but it increases bookkeeping risk if mixed with CLI migration commands later.

### 3. Future Default (Deferred): CLI-Managed Hosted Migrations

Target future workflow (recommended when ready):
```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push
```

Before switching fully to this workflow:
- reconcile hosted migration history vs manually-applied migrations
- ensure migration files in repo represent the actual hosted schema state

Until then:
- SQL Editor is okay for urgent hotfixes
- but immediately backfill migration files and notes in repo/local handoff

### 4. Migration Safety Rules

1. Do not edit old applied migrations for logic changes.
2. Create new hotfix migrations for runtime/schema fixes.
3. Apply hosted migrations in ascending order.
4. Verify function definitions if unsure what has already been applied.
5. Local parsing/tooling fixes to old migrations (for example BOM cleanup) are okay if they do not change SQL behavior.

---

## Track 2: Release Workflow (Version, Tag, Push, Publish)

This is the de facto release playbook for Haven.

### 1. Pre-Release Gates (Must-Pass)

Before releasing to users (especially with auto-update enabled):

1. Hosted DB migrations/hotfixes applied (if needed)
2. Local validation appropriate to change scope completed
3. Packaged smoke completed for Electron-sensitive changes
4. Auto-update canary plan ready
5. Release notes drafted

Examples of release-sensitive changes:
- Electron main/updater/CSP/renderer-entry changes
- Supabase auth/RLS/RPC changes
- DM/notification paths
- media/embed behavior

### 2. Release from Scratch Branch vs `main`

You can:
- build/test on scratch branches

But prefer:
- merging to `main`
- then versioning/tagging/publishing from `main`

Recommended flow:
1. commit on scratch branch
2. push scratch branch
3. merge to `main`
4. checkout `main`
5. pull latest `main`
6. bump version on `main`
7. push tags
8. publish

### 3. Exact Release Command Order (Recommended Two-Commit Flow)

#### A. Commit feature/hotfix work
```bash
git status
git add -A
git commit -m "feat: <summary>"   # or hotfix/docs/etc.
```

#### B. Merge to `main`
Use your normal GitHub merge flow (PR merge, merge commit, or FF if applicable).

#### C. Release from `main`
```bash
git checkout main
git pull origin main
npm version patch
git push origin main --follow-tags
npm run publish
```

Use `npm version minor` for larger feature releases when appropriate.

Notes:
- `npm version` creates a commit and tag by default
- it expects a clean working tree
- do not tag/version from a scratch branch unless you intentionally want that release tied to it

### 4. Alternate Release Flow (Single Release Commit)

Use only if you specifically want one combined commit:
```bash
npm version patch --no-git-tag-version
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --follow-tags
npm run publish
```

### 5. Release Asset Integrity Rules (Squirrel / Auto-Update)

These are non-negotiable for Windows auto-update stability:

1. Never replace or mutate assets for an existing version/tag.
2. If a release is bad, cut a new patch version.
3. Do not "fix" an existing `RELEASES` / `.nupkg` asset set in place.

Reason:
- Squirrel validates checksums and file sizes
- mismatched `RELEASES` vs `.nupkg` causes update failures

Troubleshooting signal:
- checksum mismatch errors usually mean release assets got out of sync

### 6. Auto-Update Canary Workflow

Before broad rollout:
1. Update one machine from currently shipped version
2. Confirm app restarts and launches
3. Confirm login/re-login works
4. Confirm second relaunch persists session
5. Confirm manual "Check now" behavior is sane

Then:
- release to broader user base
- watch for updater or startup failures

### 7. Release Notes (Minimum Required)

Always include:
- major user-visible changes
- any one-time migration effects (login, local settings, etc.)
- known limitations or flags if relevant

Example (renderer-origin parity builds):
- "You may need to sign in once after updating due to a renderer runtime origin migration."

---

## Testing Workflow Matrix (Practical)

### 1. Which Commands to Run for Which Change Type

#### UI / renderer only
```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npm run test:unit
```

#### Supabase SQL / RLS / RPC / authz changes
```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npm run test:db
npm run test:backend
```

#### Electron main / updater / CSP / media/embed changes
```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npm run test:unit
npm run make
```

Plus packaged smoke checks.

#### Release candidate (recommended)
```bash
npm run test:report
```

Or DB-focused proof run:
```bash
npm run test:report -- db
```

### 2. Proof Record Workflow

Use `test:report` when you want a durable record of what actually ran.

It gives you:
- pass/fail and duration by step
- environment snapshot
- raw logs saved per step
- Learning View (human-readable scenario summaries for SQL/backend suites)

See:
- `docs/testing/test-suite-breakdown.md`
- `docs/testing/rls-and-hardening-runbook.md`

### 3. Known Local Test Flake Handling

#### Supabase local post-reset `502` flake
If `npm run test:db` fails after migrations due to local Supabase health checks:
```bash
npx supabase stop
npx supabase start
npm run test:db
```

#### Windows local setup notes
- WSL2 is required for Docker Desktop-based Supabase local
- `psql` CLI is required for SQL harness and backend fixture cleanup
- `DEP0190` warnings from `npx.cmd` shell fallback are currently non-blocking

---

## Hotfix Workflow (DB-only, Client-only, Mixed)

### 1. DB-Only Hotfix

Use when the fix is server-side compatible and does not require a client update.

Workflow:
1. create new migration file (hotfix)
2. validate locally if possible (`test:db`, `test:backend`)
3. apply to hosted DB (SQL Editor is acceptable if urgent)
4. verify function definition/behavior in hosted DB
5. document what was applied (issue/comment/handoff note)

No client release is required if the change is fully backwards-compatible.

### 2. Client-Only Hotfix

Workflow:
1. patch code
2. run targeted validation (and packaged smoke if relevant)
3. bump patch version
4. publish new release

Rule:
- never republish same version assets

### 3. Mixed DB + Client Hotfix

Workflow (recommended):
1. DB hotfix first (runtime compatibility)
2. client patch second
3. verify hosted DB + packaged behavior
4. note ordering in release notes if user-visible

---

## Copy/Paste Checklists

## Daily Dev Checklist
- [ ] `git status`
- [ ] `git branch --show-current`
- [ ] Review GitHub issues
- [ ] Review `SESSION_HANDOFF.local`
- [ ] Confirm branch (continue or new)
- [ ] Implement scoped work
- [ ] Run appropriate validation tier(s)
- [ ] Commit checkpoint(s)
- [ ] Update `SESSION_HANDOFF.local`

## Pre-Merge Checklist
- [ ] Scope is coherent and documented if behavior changed
- [ ] `npm run lint`
- [ ] `npx tsc --noEmit --project tsconfig.json`
- [ ] Relevant tests run (`test:unit`, `test:db`, `test:backend`)
- [ ] Issue references are accurate (`Refs` vs `Closes`)
- [ ] Branch is ready to merge to `main`

## Pre-Release Checklist
- [ ] Hosted DB migrations/hotfixes applied (if needed)
- [ ] Validation run appropriate to scope
- [ ] `npm run make` + packaged smoke (if Electron-sensitive changes)
- [ ] Auto-update canary planned/run
- [ ] Release notes drafted (include one-time login note if applicable)
- [ ] Releasing from `main`, not scratch branch

## Emergency Hotfix Checklist
- [ ] Is this DB-only, client-only, or mixed?
- [ ] New hotfix migration file created (if DB change)
- [ ] Hosted fix applied and verified
- [ ] Minimal targeted validation run
- [ ] If client release required: new patch version (no asset replacement)
- [ ] Incident note added to `SESSION_HANDOFF.local` and/or issue comment

## Post-Release Watch Checklist
- [ ] Confirm GitHub release assets uploaded correctly
- [ ] Test manual "Check now" on packaged app
- [ ] Confirm canary update path works
- [ ] Watch for updater checksum/stall issues
- [ ] Watch for login/session regressions
- [ ] Watch key user paths touched by the release (DMs, notifications, media, etc.)

---

## Notes for Future You

- You now have a local test report generator (`npm run test:report`) with a Learning View. Use it when you want both proof and understanding.
- Local Supabase + hosted Supabase can coexist cleanly. The key is being explicit about which changes are local tooling/test only vs real hosted schema/runtime changes.
- Future migration workflow improvement is to standardize on CLI-hosted migration apply, but only after reconciling migration history from any SQL Editor-applied hotfixes.
