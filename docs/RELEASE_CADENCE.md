# Release cadence & branch workflow

How Haven ships, on an ongoing basis, once desktop/web reaches 2.0.0. The one-time
build-out to that first release lives in
[SOLID_SHIP_READINESS.md](./SOLID_SHIP_READINESS.md); this doc is the steady state.

Governing idea: **one repo, three release trains.** Desktop, web, and mobile ship
on their own clocks against the same `main` and the same shared core. Nothing here
forces a platform onto its own long-lived branch.

---

## Version semantics (one source of truth per train)

| Train | Versioning | Tag | Where it lives |
| --- | --- | --- | --- |
| **Desktop** (Tauri) | semver, starts `2.0.0` | `desktop-v<semver>` | `tauri.conf.json` + `Cargo.toml` + root `package.json`, kept in sync |
| **Web** (Vercel) | derived, continuous | _none_ | in-app build stamp `2.0.0+<shortSha>` + build time |
| **Mobile** (iOS) | its own semver line | `mobile-v<semver>` | `apps/mobile/package.json` + native build/version codes |

- The old unified `vX.Y.Z` tags (…`v1.9.0`) belong to the retired Electron line;
  they are history. New tags are **platform-prefixed** so the three trains never
  collide.
- Desktop is the canonical `2.x` line (Electron was `1.x`; the rewrite is the next
  generation). A version-sync check fails the release if the three desktop version
  fields disagree.
- Web has no version of its own — it _is_ whatever commit is live on `main`,
  labelled with the desktop baseline + SHA for traceability.

---

## Branch workflow

Trunk-based, short-lived branches. `main` is always releasable.

```
main ─────●────────●───────────●───────────●──────▶   (always green, auto-deploys web)
           \        \           ▲           ▲
   feat/x ●─●        \          │ squash    │
                      \  fix/y ●─● merge     │
                                             │
        desktop-v2.0.0 (tag on main) ────────┘ → desktop release workflow
```

- **`main`** — trunk. Protected. Every merge must pass the CI floor
  (`test:cleave` / `ci:verify`, per [ARCHITECTURE.md](./ARCHITECTURE.md) gates).
  Always in a shippable state.
- **Feature branches** — `feat/<short>`, `fix/<short>`, `chore/<short>`, branched
  off `main`, short-lived, merged back by PR (squash). Delete on merge.
- **Release** — not a branch. A **tag on `main`** drives a desktop or mobile
  release. Web needs no tag at all.
- **Hotfix branches** — only when `main` has already moved past a released tag and
  you must patch the released version without shipping unrelated `main` work. See
  per-platform hotfix sections.
- **No `develop`, no per-platform long-lived branches, no `web-*` branch.** They
  were considered and rejected: they fragment the trunk and force ceremony web
  doesn't need.

Mobile keeps its deliberate exception (PRINCIPLES §7): its data layer changes only
on its own gated schedule, never as a side effect of desktop/web work.

---

## All-platforms release (coordinated)

For a milestone you want live everywhere on the same code.

1. Land everything on `main`; confirm CI green and `test:all` locally.
2. Pick the release commit. **Web is already there** — merging to `main`
   auto-deployed it; confirm the live build stamp matches the commit.
3. Cut **desktop**: `git tag desktop-v<semver> <commit>` → push tag → desktop
   release workflow builds the platform matrix, signs, and publishes the GitHub
   Release + updater `latest.json`. Auto-update rolls out to existing installs.
4. Cut **mobile** from the same commit: `mobile:release:check`, build, submit to
   TestFlight/App Store, publish OTA per the mobile pipeline. Tag `mobile-v<semver>`.
5. Update CHANGELOG / release notes; archive any docs the release invalidated
   (PRINCIPLES §11).

Exit gate: all three trains report the same release commit; desktop auto-update
manifest is live; web build stamp matches; mobile build is in review/distribution.

### All-platforms hotfix

Critical fix needed everywhere, fast: land the fix on `main` (or cherry-pick if
`main` has diverged — see per-platform), then run each platform's hotfix path
below from the same fix commit. Web is fixed the instant the fix hits `main`.

---

## Desktop (Tauri)

### Standard release

- Trigger: `desktop-v<semver>` tag on `main`.
- The release workflow (`tauri-action`, platform matrix) builds, signs (Apple
  notarization + Windows Authenticode), and publishes artifacts + the updater
  `latest.json` manifest to a GitHub Release.
- Existing installs pick up the update via `tauri-plugin-updater` against that
  manifest endpoint.
- Bump rule: patch for fixes, minor for features, major for breaking/again-
  generational changes.

### Desktop hotfix

1. If `main` is still at (or cleanly ahead by safe commits of) the released tag:
   patch on `main`, tag `desktop-v<x.y.(z+1)>`, done.
2. If `main` has diverged with unshippable work: branch
   `hotfix/desktop-<x.y.(z+1)>` **from the released tag**, cherry-pick only the
   fix, tag the hotfix branch, let the workflow publish, then merge the hotfix
   branch back into `main` (no-ff) so the fix isn't lost.
3. Auto-update distributes it like any release — no user action.

---

## Web (Vercel)

### First-time setup (one-time, dashboard)

The build target ships in-repo (`apps/web/`, `vercel.json`, `build:web`). To turn
it into a live deployment, connect Vercel once:

1. **Create the project** — Vercel → Add New → Project → import `redrix-dev/haven`.
   Leave Framework Preset as **Other**; `vercel.json` already pins the build:
   `buildCommand: npm run build:web`, `outputDirectory: dist/web`, SPA rewrite.
   (Root Directory stays the repo root — the build reads `apps/web/vite.config.ts`.)
2. **Set env vars** (Project → Settings → Environment Variables, Production +
   Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
   `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`. These must keep the `VITE_` prefix to reach
   the client bundle. No secrets beyond the anon/public keys belong here.
3. **Git integration** — enabled by default on import: production deploys from
   `main`, every PR gets a preview URL. Confirm the Production Branch is `main`.
4. **Verify** — trigger a deploy, open the URL, confirm it boots to the login
   screen and the in-app build stamp (`document.documentElement.dataset.havenBuild`
   / `window.__havenBuild`) shows `2.0.0+<shortSha>` matching the deployed commit.

After this, web is continuous (below) and needs no further ceremony.

### Standard "release" — continuous

There is no web release event. **Vercel's Git integration deploys `main` to
production on every push**, and every PR gets a preview URL. Shipping web = merging
to `main`. The in-app build stamp (`2.0.0+<shortSha>`) is how you know what's live.

- Keep the CI floor as the gate: Vercel only promotes commits that are on `main`,
  and `main` only accepts green PRs.
- Optional: protect with a manual "promote to production" step in Vercel if you
  want a human in the loop; default is auto-promote.

### Web hotfix

- **Fix forward** (default): push the fix to `main`; it auto-deploys in minutes.
- **Instant rollback**: in the Vercel dashboard, promote the previous good
  deployment — zero rebuild, immediate. Then fix forward on `main` at leisure.
- No tag, no branch, no artifact signing — web's whole advantage.

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
- **Native fix** (anything touching native modules / config): new build through
  TestFlight/App Store review; OTA cannot ship native code.
- Gate either path on `mobile:release:check` green.

---

## Release notes / changelog

- Each desktop and mobile tag gets human-readable release notes on its GitHub
  Release (desktop) / store notes (mobile).
- A top-level `CHANGELOG.md` (Keep a Changelog format, sectioned per train) is the
  durable record; web entries reference the deploy commit rather than a version.
- Notes are written **as part of the release change**, not reconstructed after.
