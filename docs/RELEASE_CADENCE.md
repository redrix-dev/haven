# Release cadence & branch workflow

How Haven ships, on an ongoing basis. This is the steady-state release workflow for
the desktop, web, and mobile trains.

Governing idea: **one repo, three release trains.** Desktop, web, and mobile ship
on their own clocks against the same shared core. Integration happens on `staging`,
promotion happens on `main`, and each train cuts its own artifact from there.

---

## Version semantics (one source of truth per train)

| Train | Versioning | Tag | Where it lives |
| --- | --- | --- | --- |
| **Desktop** (Tauri) | semver, starts `2.0.0` | `desktop-v<semver>` | `tauri.conf.json` + `Cargo.toml` + root `package.json`, kept in sync |
| **Web** (Vercel) | derived, continuous | _none_ | in-app build stamp `2.0.0+<shortSha>` + build time |
| **Mobile** (iOS) | its own semver line | `mobile-v<semver>` | `apps/mobile/package.json` + native build/version codes |

- New tags are **platform-prefixed** (`desktop-v*`, `mobile-v*`) so the three
  trains never collide. The old unified `vX.Y.Z` / `release/v1.*` tags belong to
  the retired Electron line — they are history.
- Desktop is the canonical `2.x` line (Electron was `1.x`). A version-sync check
  (`npm run check:desktop-version`) fails the release if the three desktop version
  fields disagree.
- Web has no version of its own — it _is_ whatever commit is live on `main`,
  labelled with the desktop baseline + SHA for traceability.

---

## Branch workflow

Three persistent lines — `feature → staging → main` — plus short-lived
`release/*` branches cut from `main`. Flow is always forward; nothing skips a
stage.

```
feature/* ─▶ staging ──────▶ main ──────▶ release/v2.0.0   ← tag desktop-v2.0.0
               ▲   (manual    │ (protected,    │             (+ mobile-v* if coordinated)
               │   test       │  web prod)     │
               │   signoff)   │                │
               └──────────────┴────────────────┘   main ─▶ staging (merge-back)
```

- **Feature branches** — `feat/<short>`, `fix/<short>`, `chore/<short>`, branched
  off `staging`, short-lived, merged back into **`staging`** by PR. Delete on merge.
- **`staging`** — the integration line. Everything lands here first. This is where
  the **manual test suites + release signoff** run (see below) against an
  integrated tree before anything reaches `main`. A Vercel **staging** deployment
  tracks this branch so there's a stable staging URL.
- **`main`** — the promotion line. Protected; only updated by PR **from `staging`**
  once signoff is green. **Vercel production deploys from `main`** on every push.
  Always in a shippable state.
- **`release/v<semver>`** — cut from `main` for a coordinated cut. The platform
  tags (`desktop-v*`, `mobile-v*`) are applied here, which is what actually drives
  the build/publish workflows. Isolates a release so unrelated `main` work can keep
  flowing. Web ignores release branches entirely (it's already live from `main`).
- **Merge-back** — after a release branch is cut (and after any fix made on it),
  merge `main` back into `staging` so `staging` never drifts behind what shipped.

Mobile keeps its deliberate exception (PRINCIPLES §7): its data layer changes only
on its own gated schedule, never as a side effect of desktop/web work.

---

## Test signoff & release notes

The release signoff is a **manual gate run on `staging`** (it's how integrated
work is proven before promotion to `main`). It also produces the artifact that
becomes the public release notes.

```
npm run test:signoff:release -- --release-label v2.0.0-rc1 --environment staging
```

This runs the full release command set (lint · typecheck · unit · db · backend)
and writes, under `test-reports/<runId>.local/` (**gitignored — never committed**):

- `report.local.md` / the JSON + full markdown summary — **internal**: includes
  raw command logs, local filesystem paths, and signer names.
- per-step `*.stdout.log` / `*.stderr.log` / `*.combined.log` — **internal**: raw,
  unsanitized output.
- `public/signoff.local.md` — **the only sanitized, publishable artifact**. It
  carries the status table, timing, tooling versions and signatures, and
  explicitly omits raw logs and local paths ("This public signoff intentionally
  omits raw command logs and local artifact paths").

**Release-notes rule:** only the **public** summary is publishable. Copy it (edited
as you like) into `docs/releases/<tag>.md` — e.g. `docs/releases/desktop-v2.0.0.md`
— and commit it on the release branch. The desktop release workflow reads that
file verbatim into the GitHub Release body. Raw logs, full markdown, and the
`test-reports/` tree stay on your machine and never reach a public release.

If `docs/releases/<tag>.md` is absent, the workflow falls back to a generic
"installer below / auto-updates" body — so a missing notes file degrades safely
rather than leaking anything.

---

## All-platforms release (coordinated)

For a milestone you want live everywhere on the same code.

1. Land everything on `staging`; run `npm run test:signoff:release` there and
   confirm green. Curate the **public** summary into `docs/releases/<tag>.md`.
2. **Promote** `staging → main` by PR. Merging publishes **web to production**
   automatically — confirm the live build stamp matches the merge commit.
3. Cut a release branch from `main`: `git switch -c release/v<semver> main`
   (carries `docs/releases/<tag>.md`).
4. Cut **desktop**: `git tag desktop-v<semver>` on the release branch → push the
   tag → the desktop release workflow builds the platform matrix, signs, and
   publishes a **draft** GitHub Release (notes from `docs/releases/`, plus
   `latest.json`). Review, then publish — auto-update activates on publish.
5. Cut **mobile** from the same commit: `mobile:release:check`, build, submit to
   TestFlight/App Store, publish OTA per the mobile pipeline. Tag `mobile-v<semver>`.
6. Merge `main` back into `staging`. Update CHANGELOG; archive any docs the release
   invalidated (PRINCIPLES §11).

Exit gate: all three trains report the same release commit; desktop auto-update
manifest is live; web build stamp matches; mobile build is in review/distribution.

### All-platforms hotfix

Critical fix needed everywhere, fast: land the fix on `staging`, fast-track signoff,
promote to `main`, then run each platform's hotfix path below. Web is fixed the
instant the fix hits `main`. If `main` has already moved past the released tag, make
the fix on the `release/*` branch instead and merge it back to `main` → `staging`.

---

## Desktop (Tauri)

### Standard release

- Trigger: a `desktop-v<semver>` tag (applied on a `release/*` branch cut from
  `main`).
- The release workflow (`tauri-action`, platform matrix) builds, signs the updater
  artifacts (minisign), and publishes a **draft** GitHub Release with the
  `latest.json` manifest + notes from `docs/releases/<tag>.md`. Review, then publish.
- Existing installs pick up the update via `tauri-plugin-updater` against the
  published release's manifest endpoint.
- Bump rule: patch for fixes, minor for features, major for breaking/again-
  generational changes. Keep the three version fields in sync (`check:desktop-version`).

### Desktop hotfix

1. Branch `release/v<x.y.(z+1)>` **from the released tag**, cherry-pick only the
   fix, tag `desktop-v<x.y.(z+1)>`, let the workflow publish.
2. Merge the hotfix branch back into `main`, then `main → staging`, so the fix
   isn't lost.
3. Auto-update distributes it like any release — no user action.

---

## Web (Vercel)

### Standard "release" — continuous

There is no web release event. **Vercel deploys `main` to production on every
push**, and the `staging` branch deploys to a stable staging URL. Shipping web =
promoting `staging → main`. The in-app build stamp (`2.0.0+<shortSha>`) tells you
what's live. Web ignores `release/*` branches and tags entirely.

- Keep CI green as the gate; production only ever reflects `main`.
- Env vars must exist in **both** Vercel environments (Production for `main`,
  Preview/Staging for `staging`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`.

### Web hotfix

- **Fix forward** (default): land on `staging`, promote to `main`; auto-deploys in
  minutes.
- **Instant rollback**: in the Vercel dashboard, promote the previous good
  production deployment — zero rebuild. Then fix forward at leisure.

---

## Mobile (iOS)

Unchanged by the desktop/web rebuild; documented here for completeness. Mobile runs
a **custom Expo Updates-compatible OTA pipeline** (asset hashing → bundle/manifest
→ Supabase Edge Function), not EAS Update.

### Standard release

1. `mobile:release:check` (theme/surface checks + preflight + mobile typecheck).
2. Native build via the Expo/EAS dev-client flow; submit to TestFlight → App Store.
3. Publish the OTA bundle/manifest for the matching runtime version.
4. Tag `mobile-v<semver>`.

### Mobile hotfix

- **JS-only fix** (no native change): push an OTA update via the custom pipeline
  (`tooling/scripts/mobile/`) — clients pick it up at next launch. No store review.
- **Native fix**: new build through TestFlight/App Store review; OTA cannot ship
  native code.
- Gate either path on `mobile:release:check` green.

---

## Release notes / changelog

- Each desktop/mobile release gets human-readable notes — sourced from the
  **public** signoff summary in `docs/releases/<tag>.md` (desktop workflow reads it
  into the GitHub Release; mobile store notes drawn from the same file).
- A top-level `CHANGELOG.md` (Keep a Changelog format, sectioned per train) is the
  durable record; web entries reference the deploy commit rather than a version.
- Notes are written **as part of the release change**, not reconstructed after.
- Never publish raw `test-reports/` logs or the internal/full signoff — public
  notes come only from the sanitized public summary.
