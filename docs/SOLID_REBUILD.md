# The Tauri + Solid rebuild — active plan

The live plan for replacing the retired Electron/React desktop and web clients with
a Tauri shell and a Solid UI on the cleaved architecture. Updated as phases land;
completed phases get one line and a pointer to the archive.

---

## Where we are

| Phase                                                    | Outcome                                                                                                                                                                         | Record                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Spike (shell + Solid composition)                        | ✅ proven                                                                                                                                                                       | [\_archive/tauri-solid-rebuild.md](./_archive/tauri-solid-rebuild.md)         |
| Gate 1 — go/no-go on the stack                           | ✅ **GO** (2026-06-07). Both killswitches cleared: two-way LiveKit voice in WKWebView; Solid reactively driving real shared stores                                              | [\_archive/tauri-solid-roadmap.md](./_archive/tauri-solid-roadmap.md)         |
| THE CLEAVE — split shared logic from per-platform caches | ✅ complete (2026-06-08). Shared is pure; mobile owns `HavenReactCore`                                                                                                          | [\_archive/solid-migration-handoff.md](./_archive/solid-migration-handoff.md) |
| Legacy client removal                                    | ✅ complete (2026-06-09). Electron/React-web deleted; root deps 36→6; scripts and guards repaired                                                                               | git history (`rewrite/desktop-web-rebuild`)                                   |
| Solid data layer + `HavenSolidCore`                      | ✅ substantially built. Per-domain `*SolidCache.ts` wired to real backends; `HavenSolidCore` (385 LOC) implements `RealtimeMutationTarget`. A few caches still thin (see below) | git history (`5898820` wired real backends)                                   |
| **Solid UI + theme foundation**                          | **← current phase**                                                                                                                                                             | this file                                                                     |

**Why Solid, in one paragraph:** the Nexus cache pattern was lifted from the
stoat/Revolt SDK, which runs it on Solid's fine-grained reactivity — that's why the
original needs no snapshot caches, revision counters, or selector factories. Haven
ran the same pattern on zustand and shared the reactive cache across platforms, and
all of that machinery had to be hand-built to compensate. Moving desktop/web to
Solid returns the pattern to the substrate it was born for; the cleave removed the
sharing. (Full reasoning: archive, roadmap Phase 2.)

## What's actually built (audited 2026-06-10)

The data and core layers are **done and wired to real backends** — the earlier
"flesh out stubs" framing of this doc was stale. Concretely:

- **`HavenSolidCore`** (`core/HavenSolidCore.ts`, ~385 LOC) implements
  `RealtimeMutationTarget`, with real `bootstrapSession` and cross-cache routing.
  Supporting core: `bootstrapPhase`, `havenSolidRegistry`/`havenSolidRef`,
  `SessionProvider`, `solidAuthService`. No stubs.
- **Per-domain caches** under `data/<domain>/` following the documented
  `*SolidCache.ts` (+ `accessors.ts` + `index.ts`) shape. Substantial and real:
  channels, communities, direct-messages, notifications, permissions, social,
  profile, messages. **Still thin / audit before relying:** `feature-flags`,
  `onboarding`, `voice`, `community-management`.
- **Accessors (the UI read layer)** exist for **channels, communities,
  direct-messages, notifications** only. The rest are added per the
  [`data/README.md`](../packages/solid-client/src/data/README.md) rule — _an
  accessor is written when a screen first needs to read that domain_, so a missing
  one is by-design, not debt.
- **Session stores** (auth, ui, userStatus, viewerMessagePolicy) built.

The frontier is everything **above** the cache: there is no real UI yet
(`App.tsx` + `DevLogin.tsx` only), and **the theme/styling layer is unwired** —
`solid-client/src/styles.css` is hand-written placeholder colors, not the shared
theme.

## Current phase — UI + theme foundation

Order of work (each step gated by `test:cleave` + `typecheck:solid` / `build:solid`):

1. **Theme + Tailwind foundation — ✅ done (2026-06-10).** Theme parity comes free
   from the existing codegen: `generate-theme-bridge` writes
   `packages/shared/src/styles/globals.css` (302 tokens, Tailwind v4
   `@import "tailwindcss"` + `@theme inline` + dark variant) from the same shared
   `themes/` source that drives mobile — no new codegen target. How it's wired (and
   the gotchas worth knowing for the web shell later):
   - Tailwind deps (`tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`) live at
     **root** — the Solid app runs on root `node_modules` (there is no
     Solid-scoped install). No collision with mobile, which uses UniWind, not
     `tailwindcss`.
   - `@tailwindcss/vite` plugin added to `apps/tauri/vite.config.ts`.
   - The app imports an **app-owned** `packages/solid-client/src/theme.css` that
     `@import`s the generated globals.css and adds `@source` lines — **not** the
     globals.css directly. Tailwind v4 roots its class-scan near the CSS file's
     package (`packages/shared`) and the vite root (`apps/tauri`), so without
     `@source` it sees zero UI source and generates **no utilities** (theme vars
     load, but `bg-*`/`text-*` classes silently don't). Add a `@source` line if UI
     classes ever live somewhere new.
   - `styles.css` (placeholder spike CSS) stays until step 2 replaces it with theme
     utilities; a temporary `ThemeProbe` in `App.tsx` verifies both layers and gets
     deleted once confirmed.
2. **"Dumb UI behind login" playground.** A minimal authenticated screen reached
   through the real `solidAuthService` → `SessionProvider` → `bootstrapSession`
   path. Low domain complexity on purpose: it proves the theme setup renders, and
   exercises the session/accessor read path before tackling a data-heavy screen.
3. **Real screens as vertical slices.** One screen at a time, consuming caches
   **through accessors only**; add a domain's `accessors.ts` when its first screen
   needs it. The community channel chat view is the meatiest slice — it exercises
   the `messages` cache + realtime end to end; do it once the playground proves the
   plumbing.
4. **Shell capabilities.** Map the `AppHost` bridge surface
   (`packages/shared/src/infrastructure/platform/appHost.ts`) onto Tauri
   `invoke()` commands as features need them: window chrome, updater, deep links
   (`haven://`), notifications, file save.

**Solid-ism to design around:** Solid tracks reactivity at access time — any
accessor taking a reactive argument takes it as a getter (`() => communityId`), not
a plain value, so it re-subscribes when the value changes.

## React → Solid mapping (for the UI build)

Carried from the spike evaluation; verify each on first use.

| Need                  | Solid choice                                  | Notes                                           |
| --------------------- | --------------------------------------------- | ----------------------------------------------- |
| Core                  | `solid-js`                                    | Components run once; signals, not hooks         |
| Headless primitives   | `@kobalte/core`                               | Replaces radix; API differs                     |
| Icons                 | `lucide-solid`                                | Near drop-in                                    |
| Toasts                | `solid-sonner`                                |                                                 |
| Virtualized chat list | `virtua` (Solid) or `@tanstack/solid-virtual` | **Verify chat scroll behavior carefully**       |
| Rich text editor      | `@tiptap/core` + manual Solid binding         | Tiptap core is framework-agnostic               |
| Markdown              | render `marked` output / `solid-markdown`     |                                                 |
| Image crop            | wrap a vanilla lib                            | No 1:1 port — known gap                         |
| Command palette       | `cmdk-solid` or build on Kobalte              | **Verify maintenance** before adopting          |
| Gestures              | `@use-gesture/vanilla` + wrapper              |                                                 |
| Auto-update           | `@tauri-apps/plugin-updater`                  | Same GitHub-releases flow the Electron app used |

## How to run

```bash
npm run dev:solid    # Solid UI in a plain browser (no Rust needed) — port 5174
npm run tauri:dev    # Full Tauri shell (requires Rust toolchain: rustup.rs)
npm run build:solid  # Production bundle → dist/tauri
npm run typecheck:solid
```

## Standing decision — workspace packages

**Status: DECIDED (end state) · NOT YET SCHEDULED · interim guardrail in place.**

`@shared` (and any lasting shared package) must eventually become a real workspace
package (`package.json` + `name` + `exports`). The path-alias approach is a
deliberate interim. The alias's truthful cost: no enforced public surface (anything
can deep-import internals), no real dependency graph, and hand-maintained
resolution duplicated across every toolchain — each copy a silent drift footgun.

**Sequencing rules (do not violate):**

1. **Do not half-migrate.** Two resolution mechanisms at once is worse than either
   pure state. Convert in one dedicated "monorepo resolution" milestone.
2. **Trigger:** schedule it when `@shared`-as-a-real-package is on the near roadmap.
3. **Safety net:** the headless `mobile:bundle` CI gate is what makes the
   conversion safe to attempt — keep it green before starting.

**Empirical finding (2026-06-08):** Expo's Metro (SDK 49+) honors tsconfig
`compilerOptions.paths` natively — breaking the babel and metro alias copies still
bundled; only removing the tsconfig entry failed the export. The babel/metro copies
are redundant belt-and-suspenders. The cleaner interim is tsconfig-paths as the
single mobile resolver; settle tsconfig-only vs. belt-and-suspenders when the
milestone is scheduled. Corollary: `mobile:bundle` does **not** catch single-layer
alias drift while redundant resolvers exist.

## Explicitly not in scope yet

- New product features on any platform.
- Touching mobile's feature surface (data-layer plumbing only, gated, deliberate).
- Performance work in the Solid app before it renders real data.
