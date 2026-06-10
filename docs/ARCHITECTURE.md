# Architecture

Current truth of how Haven is shaped. If this file disagrees with the code, the code
wins and this file gets fixed in the same change. Governing mindset: [PRINCIPLES.md](./PRINCIPLES.md).

---

## The monorepo

```
apps/
  mobile/          React Native + Expo. LIVE on TestFlight (production target).
                   Own package.json + node_modules (react is mobile-owned).
  tauri/           Tauri v2 shell for the desktop/web rebuild (in progress).
packages/
  shared/          PURE logic, types, backend clients. Zero framework, zero
                   reactivity. Consumed by every platform.
  solid-client/    Solid UI + Solid-native caches for desktop/web (in progress).
supabase/          Migrations, RLS policies, Edge Functions, SQL test suites.
tooling/           Scripts (checks, test harness, mobile ops) + test-support.
docs/              You are here.
```

The previous production clients — Electron desktop and Vite/React web — shipped,
proved the product, and were retired in June 2026 in favor of this rebuild. Their
history lives in git and [docs/\_archive/](./_archive/).

## The three layers (the law)

```
packages/shared (pure logic)  →  per-platform cache  →  per-platform UI
```

1. **Dependencies point inward.** Shared never imports a platform or a cache. A
   cache never imports another platform's cache.
2. **Logic is shared and pure.** Fetching, merging realtime events, visibility and
   permission filtering, pagination math, event routing, domain rules, types — all
   of it is data-in → data-out, lives in `packages/shared`, and is identical on
   every platform. No `react`, no `solid-js`, no React-flavored zustand
   (`zustand/vanilla` is allowed). Enforced by `check:shared-portable`.
3. **Caches are per-platform.** Mobile's React cache lives in
   `apps/mobile/src/data/` (`HavenReactCore` — see
   [architecture/HAVEN_CORE.md](./architecture/HAVEN_CORE.md)). Desktop/web's
   Solid-native cache lives in `packages/solid-client/src/data/` (`HavenSolidCore`,
   being built). A reactive store is **never** shared across frameworks.

One sentence: _we share the smarts and let each platform keep its own dumb memory._

## Where things live in `packages/shared`

Canonical homes — one implementation per module, no duplicate trees and no
re-export shims:

| Concern                                                            | Home                                         |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Backend clients, RPC wrappers, network shapes                      | `lib/backend/`                               |
| Supabase client construction                                       | `lib/createHavenSupabaseClient.ts`           |
| Domain logic (messaging, auth, notifications, voice, …)            | `features/<domain>/`                         |
| Realtime routing (pure, over `RealtimeMutationTarget`)             | `core/routeRealtimeEvent.ts`                 |
| Persistence port + memory adapter                                  | `core/persistence/`                          |
| Pure selectors + entity type barrels                               | `nexus/` (types/selectors only — no classes) |
| Platform capability port (`AppHost`)                               | `infrastructure/platform/appHost.ts`         |
| Themes (tokens, registry — the one place hex literals are allowed) | `themes/`                                    |
| Shared types, DB types                                             | `types/`                                     |

## Platforms

| Platform | Shell                       | UI                     | Cache                           | Status                                     |
| -------- | --------------------------- | ---------------------- | ------------------------------- | ------------------------------------------ |
| iOS      | Expo dev client             | React Native (UniWind) | `HavenReactCore` (zustand)      | **Live** — TestFlight, custom OTA pipeline |
| Desktop  | Tauri v2 (Rust + WKWebView) | Solid                  | `HavenSolidCore` (Solid stores) | In rebuild                                 |
| Web      | Vite (same Solid app)       | Solid                  | same as desktop                 | In rebuild                                 |

Backend for all of them: Supabase (Auth, Postgres + RLS, Realtime, Edge Functions),
LiveKit Cloud for voice.

## Realtime (one subscription)

Exactly **one** domain realtime subscription per user: `private_user:{userId}` →
`routeRealtimeEvent` → targeted cache patch/evict/reload. Feature code never opens
its own `postgres_changes` listener (voice room presence is the documented
exception). Coverage matrix and open holes:
[architecture/REALTIME.md](./architecture/REALTIME.md).

## Guardrails (decisions, encoded)

| Guard                                                                     | Enforces                                                                                                             | Why                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `check:shared-portable`                                                   | No react/solid/react-zustand, no browser globals in portable paths, no `use*` exports under `core/`                  | The three-layer law, mechanically                                         |
| `check:shared-hex`                                                        | No hex color literals in shared outside `themes/`                                                                    | Colors flow through the theme system                                      |
| `mobile:ownership`                                                        | Root must not own react/expo deps; mobile must not own solid/tauri/vite                                              | Dependency ownership mirrors the layer split                              |
| `check:themes`                                                            | Theme bridge outputs match their source                                                                              | Mobile themes are generated from shared tokens; drift = visual divergence |
| `check:chat-surface` / `check:mobile-uniwind` / `check:mobile-typography` | Mobile UI conventions                                                                                                | Theme/typography consistency on the live app                              |
| eslint boundary rules                                                     | UI/features can't import backend factories, construct Supabase clients, touch persistence, or open realtime directly | The HavenCore → cache → UI consumer contract                              |
| `mobile:bundle`                                                           | Headless Metro export resolves the whole mobile module graph                                                         | Catches broken imports/aliases in CI without a simulator                  |

## Gates

| Gate                    | Runs                                                                                  | When                                      |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `test:cleave`           | lint · shared-portable · **typecheck** · mobile:typecheck · mobile:bundle · test:unit | The fast CI bundle; floor for every merge |
| `test:ci` / `ci:verify` | test:cleave + `test:db` (SQL/RLS suite) + `test:backend` (contract tests)             | CI on push/PR (needs local Supabase)      |
| `test:all`              | Everything above + theme checks                                                       | Pre-release local                         |
| `mobile:release:check`  | Theme/surface checks + preflight + mobile typecheck                                   | Before any mobile release                 |

## Module resolution (interim, with an expiry)

`@shared/*`, `@platform/*`, `@mobile-data/*`, `@solid-client/*` are **path
aliases**, currently mirrored across tsconfig / babel / metro / vitest. This is a
sanctioned interim, not the destination — the standing decision is to convert
shared packages to real npm workspace packages (`package.json` + `exports`) in one
dedicated milestone. Details, sequencing rules, and the empirical finding that
tsconfig paths alone drive Metro resolution:
[SOLID_REBUILD.md § Standing decision](./SOLID_REBUILD.md#standing-decision--workspace-packages).

## Editor configuration

Haven is developed primarily in **Zed**, occasionally in **Cursor**. Two editor
config files are **tracked and intentionally kept roughly in sync** so the repo
behaves the same in either — they are maintained, not leftover cruft:

| File                   | Editor                       | Tracked?        |
| ---------------------- | ---------------------------- | --------------- |
| `.zed/settings.json`   | Zed (primary)                | yes             |
| `haven.code-workspace` | VSCode / Cursor              | yes             |
| `.vscode/`             | VSCode per-machine overrides | no — gitignored |
| `.cursor/`             | Cursor per-machine state     | no — gitignored |

The split is deliberate: shared, repo-wide editor behavior lives in the two tracked
files (kept aligned with each other); anything machine- or person-specific stays in
the gitignored `.vscode/` and `.cursor/`. When you change one tracked file's
repo-wide behavior (exclusions, formatter, file associations), mirror it in the
other. Both carry a header comment pointing back here.
