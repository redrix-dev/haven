---
name: haven-branch-ci-gates
description: Use when starting, scoping, testing, finishing, or handing off any Haven repo change; covers branch base, staging-first workflow, package manager discipline, generated artifacts, CI lanes, and validation command selection.
---

# Haven Branch And CI Gates

## Start Every Change

1. Check the worktree first.
   - `git status --short --branch`
   - Do not overwrite user changes.
2. Refresh remotes.
   - `git fetch --all --prune`
3. Base feature/fix/docs work on `staging`.
   - `git switch staging`
   - `git pull --ff-only origin staging`
   - `git switch -c <type>/<short-name>`
4. Do not merge `main` into feature work unless the release workflow explicitly
   calls for it. `main` is promotion, not the day-to-day base.

## Runtime And Install Discipline

- Use Node 24. The repo pins this with `.nvmrc`, `.node-version`, CI, and
  package engines.
- Use npm, not pnpm or yarn. The root `packageManager` pins npm.
- Use `npm ci` when lockfile correctness matters. Use `npm run setup:mobile` to
  install the mobile tree.
- If dependencies change, commit the matching lockfile:
  `package-lock.json` for root and `apps/mobile/package-lock.json` for mobile.
- Never commit local build or test outputs: `dist/`, `test-reports/`,
  `.ota-export/`, `apps/mobile/ios/`, `apps/mobile/android/`, Supabase `.temp/`,
  or generated local Supabase test users.

## Pick The Gate By Blast Radius

- Docs-only change:
  - `npx prettier --check <changed-md-files>`
- Agent handoff/skill change:
  - `npm run check:agent-skills`
- Shared/domain/Solid/mobile TS change:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run mobile:typecheck` if shared or mobile can be affected
  - `npm run test:unit` for cache, selector, utility, or UI logic changes
- Fast merge floor:
  - `npm run test:cleave`
- DB/RLS/RPC/backend-contract change:
  - `npm run test:db`
  - `npm run test:backend`
  - `npm run test:ci` before signoff
- Mobile UI/native/release-sensitive change:
  - `npm run mobile:preflight`
  - `npm run check:mobile-uniwind`
  - `npm run check:mobile-typography`
  - `npm run mobile:typecheck`
  - `npm run mobile:bundle`
- Theme-token change:
  - `npm run themes:generate`
  - `npm run check:themes`
- Native voice sidecar change:
  - `cargo build --locked --manifest-path apps/tauri/haven-voice/Cargo.toml`

## CI Shape

- `fast` runs lint, shared portability, typecheck, and unit tests.
- `mobile` runs ownership, preflight, Expo config, mobile typecheck, and bundle
  smoke.
- `integration` runs only when DB/shared/test harness inputs changed.
- `sidecar` runs only when `apps/tauri/haven-voice/**` changed.
- `gate` is the required aggregate check; skipped integration/sidecar lanes are
  valid only when their path filters say they are unchanged.

## Before Handoff

- Run `git status --short --branch`.
- State exactly which validation commands passed.
- State which expected commands were not run and why.
- Include doc updates in the same change when behavior or architecture changed.
