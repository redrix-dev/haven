# Solid client — ship plan & readiness (2026-06-21)

Supersedes the 2026-06-20 audit. That audit answered _"can the core run?"_ (yes).
This document answers the harder question: **what does "shipped" mean for Haven
desktop/web, and what is the sequenced, gated path to get there.**

Ongoing release mechanics (cadence, branch workflow, hotfixes) live in their own
doc: [RELEASE_CADENCE.md](./RELEASE_CADENCE.md). This file is the one-time
build-out to the first release.

---

## What "shipped" means here

The bar is not "the core loop runs." The bar is:

1. **Feature parity** with what Haven already shipped to production — the mobile
   app (live on TestFlight) and the retired Electron/React desktop+web clients
   (on `main`, in git history). If a feature existed in a shipped client, the
   Solid client matches it or has a deliberate, documented reason not to.
2. **Release engineering done, not hand-waved** — Tauri auto-update configured,
   the Vite web build prepared for Vercel, versions reconciled to a `2.0.0`
   desktop baseline, web tracked continuously without its own branch or release
   ceremony, and CI/CD that actually builds and publishes what it claims to.
3. **Presentable** — this repo and the first release are a portfolio piece. The
   README and surfacing docs read well to a skimming recruiter with deep-dives a
   click away, without looking staged for that purpose.

Three release trains, one repo: **desktop** (semver, tagged), **web**
(continuous from `main`), **mobile** (its own semver line + custom OTA). See
[RELEASE_CADENCE.md](./RELEASE_CADENCE.md).

---

## ✅ Works today (verified live)

Auth + bootstrap (`rehydrating → … → ready`), realtime connected · communities,
channels, members panel · community chat (text send, realtime, pagination,
markdown, image attach + inline render, edit/delete/react/report) · voice
(join/leave, mute/deafen, presence, popout, join/leave/notification sounds) ·
DMs (incl. media, report) · friends · profile (nexus) · theme lifecycle.

**There are no crash blockers.** Every gap below is a missing feature or absent
infra, not a runtime failure.

---

## Feature parity matrix

Legend: ✅ done · ⚠️ backend/read path only, UI absent · ⛔ deferred (fast-follow) ·
❌ stub that throws / not wired.

| Feature | Mobile | Electron (retired) | Solid | Gap to close |
| --- | :-: | :-: | :-: | --- |
| Auth + bootstrap | ✅ | ✅ | ✅ | — |
| Communities (list/grid/switch) | ✅ | ✅ | ✅ | — |
| Text channels (send/edit/delete/react/report/paginate/markdown) | ✅ | ✅ | ✅ | — |
| Media upload + inline render | ✅ | ✅ | ✅ | — |
| Voice (join/leave/mute/deafen/presence/popout/sounds) | ✅ | ✅ | ✅ | — |
| Direct messages (+ media, report) | ✅ | ✅ | ✅ | — |
| Friends / social | ✅ | ✅ | ✅ | — |
| Profile + theme + appearance settings | ✅ | ✅ | ✅ | — |
| Notifications inbox (counts, mark read) | ✅ | ✅ | ✅ | Built — bell + unread badge + inbox page (read/dismiss/mark-all) |
| Notification toasts (in-app surface) | ✅ | ✅ | ✅ | Built — custom themed toast (not solid-sonner) |
| **Onboarding (new-user flow)** | ✅ | ✅ | ✅ | Campaign gate + screen (server-driven cards) |
| **Community moderation (ban/kick/redact)** | ✅ | ✅ | ✅ | Ban/kick/unban + bans list (members panel); redact = existing mod-delete |
| **Feature flags (gating)** | ✅ | ✅ | ✅ | Flags load at bootstrap + reset on sign-out; `useFeatureFlag`/`FeatureGate` port (contexts); theme-entitlement gating wired |
| Modmail / reports inbox | ✅ | ✅ | ✅ | Built — siderail Modmail inbox: cross-community queue (live add/remove as access changes), triage (status/note/escalate/acknowledge), `report_created` broadcast for live arrivals |
| Invites (create/share UI) | ✅ | ✅ | ✅ | Built — settings Invites tab: create (expiry + max-uses), active list, copy link, revoke |
| Community role editor | ✅ | ✅ | ✅ | Roles list + editor (name/color/permission toggles, create/delete) |
| Cache persistence / offline rehydrate | ✅ | ✅ | ✅ | Wired on persist-capable nexuses via `NexusPersistence` |
| Community display-order (drag-reorder, persisted) | ✅ | ✅ | ⚠️ | Write side + drag UI |
| Rich composer | ✅ (enriched-md) | ✅ (Tiptap) | ⛔ | Rich composer (plain textarea today) |
| PTT / voice-activity gating | ✅ | ✅ | ⛔ | Voice extras |

**Parity-blocking: all closed.** ✅ Onboarding, moderation, role editor,
notifications, invites, modmail inbox, report creation, and feature-flag gating
are all built on the nexus pattern. (Report creation = right-click / long-press /
"…" menus on message authors, members, community messages, and DMs — community
reports offer community-mods / platform / both; DMs platform-only.)
**Fast-follow** (ship as core beta without, close shortly after): rich composer,
display-order drag, PTT, device picker, loading skeletons.

---

## The data layer: nexus conversion is now in scope (not deferred)

**Decision (this revision):** the remaining parity features all sit on the data
layer. Building them on the old `XSolidCache` pattern and converting later is
double work. So the **nexus crossover conversion ("grounding pass") is promoted
from background refactor to a ship prerequisite** — done correctly, including the
persistence wiring, so the missing subsystems get built once, on the clean
pattern.

**Converted (nexus):** all domains — channels, communities, profile, notifications,
onboarding, community-management (admin + moderation), direct-messages,
feature-flags, messages, permissions, social, voice.
**Persistence wired:** communities, channels, notifications, direct-messages,
community-messages (per-community registry). Host adapter: `createLocalStoragePersistence`
(Tauri webview + web); Tauri no longer uses in-memory-only stub.

What a conversion involves (per [data/README](../packages/solid-client/src/data/README.md),
template = `channelSolidNexus.ts` / `communitySolidNexus.ts`):

- Rename `XSolidCache` → `XSolidNexus`; drop `wireSolidReadableStore` + the
  `reactiveStore` property and every manual `notify()` call.
- Move reactive projections into the class as methods returning `Accessor<T>`
  via `createMemo` over the shared selectors in `@shared/nexus/<domain>/`.
- Keep inflight tracking, revision bumping, and state shape; mutate through Solid
  store paths so reactivity is automatic.
- **Implement `rehydrate()` for real** against the persistence port
  (`@shared/core/persistence/`) — this is where offline/persisted state (a
  parity item) gets wired, not bolted on later.
- Update `index.ts` exports and `HavenSolidCore` wiring.

Rough effort (build, don't quote as commitment): notifications / community-admin
small; permissions / social / voice medium; direct-messages / messages large.

---

## Release engineering — the build-out

Current reality (verified): desktop baseline **2.0.0** with identifier
`com.redrixx.haven`, bundling active, updater plugin + release workflow present.
Web build target **landed** (`apps/web/` + `build:web` + `vercel.json`, boots to
login locally with build stamp surfaced); remaining web work is the one-time
Vercel project hookup (dashboard) — see Phase 2. CI merge floor runs
`test:cleave`; desktop version sync enforced via `check:desktop-version`.

### A. Versioning → 2.0.0, one source of truth

Three files carry a version with no sync today: root `package.json`,
`apps/tauri/src-tauri/Cargo.toml`, `apps/tauri/src-tauri/tauri.conf.json`. Plan:

- Desktop baseline **2.0.0**. Bump all three; flip identifier
  `com.redrixx.haven.spike` → `com.redrixx.haven`; rename productName off
  "(Tauri spike)".
- Add a tiny version-sync check/script (reuse the `tooling/` checks pattern) so a
  release can't ship with the three out of step. Resolve the BACKLOG "version
  semantics" item: **desktop owns the `2.x` semver line; mobile keeps its own
  line; web is derived (below).**

### B. Tauri auto-update

- `bundle.active: true`, set bundle targets per platform.
- Add `tauri-plugin-updater` (+ `tauri-plugin-process` for restart) to
  `Cargo.toml` and the updater config block to `tauri.conf.json` (endpoint +
  public key).
- Generate a signing keypair; private key into CI secrets, public key into config.
- Updater endpoint = the GitHub Releases `latest.json` manifest produced by the
  release workflow (below). Code signing (Apple notarization, Windows
  Authenticode) is required for clean install/update UX — track certs as a
  prerequisite, not an afterthought.

### C. Vite web build for Vercel ✅ (build-out done; Vercel hookup pending)

- The Solid app is shell-agnostic via the `HavenBridge` pattern — desktop injects
  Tauri capabilities; web runs with no bridge (`<App />`, `useBridge()` falls back
  to web equivalents per capability). No code fork needed, only a build target.
- **Done:** `apps/web/` mirrors the Tauri shell minus native bits — `index.html`
  (shared boot splash), `src/main.tsx` (boots core, no bridge), `createWebHavenCore`
  (always `createLocalStoragePersistence`), `getWebSupabase` (`detectSessionInUrl`
  on for web auth redirects). `apps/web/vite.config.ts` emits a static SPA to
  `dist/web`; scripts `dev:web` / `build:web` / `preview:web` / `typecheck:web`.
  `vercel.json` at repo root (framework null, `buildCommand: npm run build:web`,
  `outputDirectory: dist/web`, SPA rewrite to `/index.html`, immutable asset
  caching). Verified: typecheck + eslint clean, `build:web` green, boots to the
  login screen in-browser with no console errors.
- **Build stamp** (`buildInfo.ts`, Vite `define`): `2.0.0+<shortSha>` + ISO build
  time, sourced from `package.json` + `VERCEL_GIT_COMMIT_SHA` (local git fallback).
  Surfaced as `document.documentElement.dataset.havenBuild`, `window.__havenBuild`,
  and a boot `console.info`. This is the web "version" — see D. (A visible
  About/footer placement is a tidy fast-follow; the stamp itself is wired.)
- **Pending (not code):** create the Vercel project pointed at this repo, set
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (+ `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`)
  as project env vars, and enable the Git integration (D).

### D. Web version tracking (no branch, no release ceremony)

**Vercel Git integration drives web off `main`:** every push to `main`
auto-deploys production; every PR gets a preview URL. The web "version" is the
commit SHA + build timestamp surfaced in-app — **not** a git tag and **not** a
separate branch. Desktop keeps semver tags; web tracks `main` HEAD continuously.
Full rules + rollback in [RELEASE_CADENCE.md](./RELEASE_CADENCE.md).

### E. CI/CD evaluation

Keep `ci.yml` as the merge floor (`test:cleave` / `ci:verify`). Add, sanely:

- **Desktop release workflow** — triggered by a `desktop-v*` tag. Platform matrix
  (macOS / Windows / Linux), `tauri build`, sign, publish artifacts + updater
  `latest.json` to a GitHub Release. `tauri-action` covers most of this; prefer it
  over hand-rolled steps.
- **Web** — no GitHub workflow needed for deploy (Vercel's own integration). Keep
  CI green as the gate; Vercel only promotes builds that come from `main`.
- **Mobile** — unchanged; its custom OTA pipeline (`tooling/scripts/mobile/`) and
  `mobile:release:check` already exist.

Sanity rule: a workflow that builds artifacts must be **separate** from the
per-PR verify job — never make every PR build signed binaries.

---

## Documentation & portfolio (criterion: presentable)

- **README** — keep the honest technical voice; add a recruiter-skim layer on top
  (badges, feature-at-a-glance, screenshot, architecture-at-a-glance) with the
  existing deep-dive prose below. Done in this change.
- **RELEASE_CADENCE.md** — new; the one genuinely-missing top-level doc (cleared
  the "small on purpose" bar because nothing else covers ongoing release/branch
  workflow). Done in this change.
- Living-doc discipline (PRINCIPLES §11) still applies: when each phase below
  lands, update or archive the docs it invalidates **in the same change**.
- `docs/internal/` and `docs/reference/` stay gitignored as-is — no need to delete
  internal notes; they're simply not part of the public surface.

---

## Sequenced path to 2.0.0 (goal → exit gate)

Each phase has an exit gate per PRINCIPLES §9. Phases 1–2 are independent of the
feature work and can run in parallel with it.

| # | Phase | Exit gate |
| - | --- | --- |
| 0 | **Presentation** (README skim layer, RELEASE_CADENCE, version-semantics decision) | README reads well cold; cadence doc merged; one version source of truth defined |
| 1 | **Release infra — desktop** (2.0.0 bump + identifier, bundling on, updater plugin + keys, release workflow) | Tagging `desktop-v2.0.0` on a branch produces signed, auto-updatable artifacts in a GitHub Release |
| 2 | **Release infra — web** (web Vite config, `build:web`, `vercel.json`, Vercel git integration, build stamp) | 🟡 Build-out done & verified local (`build:web` green, boots to login, stamp shows SHA); remaining = create Vercel project + env vars + Git integration so push to `main` auto-deploys and PRs get previews |
| 3 | **Nexus grounding pass** (convert the 9 domains; implement `rehydrate()`/persistence correctly) | ✅ All domains on nexus; `test:cleave` green; offline rehydrate on reload (persist domains) |
| 4 | **Parity features** (onboarding, moderation, feature flags, modmail/reports UI, invites UI, role editor UI — built on the nexus pattern) | Parity matrix has no parity-blocking ❌/⚠️ rows |
| 5 | **Fast-follow polish** (toasts, rich composer, display-order drag, PTT, skeletons) | Triaged; ship as 2.0.x increments, not gating 2.0.0 |
| 6 | **Ship 2.0.0** | Phases 0–4 gates green; release cut per cadence doc; web on same commit |

**Ship call:** a *core beta* is shippable today; the **2.0.0 portfolio release**
is Phases 0–4. Phase 5 is deliberately post-release. The nexus conversion is no
longer optional background work — it's Phase 3, the foundation Phase 4 builds on.

---

## Tsconfig / infra notes (still open, from the 2026-06-16 audit)

Inert project `references` (no `composite`), mobile-data double-included under two
module systems, `@platform`/`@mobile-data` `paths` drift, broad `allowJs`. Folds
into the BACKLOG "workspace packages" milestone; not a 2.0.0 blocker.
