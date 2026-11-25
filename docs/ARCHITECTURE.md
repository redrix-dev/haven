# Architecture

Current truth of how Haven is shaped. If this file disagrees with the code, the code
wins and this file gets fixed in the same change. Governing mindset: [PRINCIPLES.md](./PRINCIPLES.md).

---

## The monorepo

```
apps/
  mobile/          React Native + Expo, on TestFlight.
                   Own package.json + node_modules (react is mobile-owned).
  tauri/           Tauri v2 desktop shell around the Solid client.
  web/             The same Solid client as a static site (Vercel).
packages/
  shared/          Logic, types, backend clients, the collections and HavenCore.
                   No UI framework. Used by every platform.
  solid-client/    Solid UI and HavenSolidCore for desktop and web.
                   Folder shape + dependency law: architecture/SOLID_CLIENT_SHAPE.md.
supabase/          Migrations, RLS policies, Edge Functions, SQL test suites.
tooling/           Scripts (checks, test harness, mobile ops) + test-support.
docs/              You are here.
```

The previous production clients — Electron desktop and Vite/React web — shipped,
proved the product, and were retired in June 2026 in favor of this rebuild. Their
history lives in git.

## The three layers (the law)

```
packages/shared (logic, collections, HavenCore)  →  per-platform stores  →  per-platform UI
```

1. **Dependencies point inward.** Shared never imports a platform. One
   platform never imports another's.
2. **Logic is shared.** Fetching, applying realtime events, paging, domain
   rules, types — and each collection and the session's `HavenCore` that run
   them — live in `packages/shared` and behave identically on every platform.
   No `react`, no `solid-js`, no React-flavored zustand (`zustand/vanilla` is
   allowed). Enforced by `check:shared-portable`.
3. **Reactive memory is per-platform.** A collection reads and writes through
   a `StatePort`; the store behind it is the platform's, made by the core's
   `makePort`: a Solid store for desktop and web (`HavenSolidCore`, in
   `packages/solid-client/src/core/`), a Zustand store on the phone
   (`HavenReactCore`, in `apps/mobile/src/data/core/`). A reactive store is
   **never** shared across frameworks. Screens read the stores through the
   collections' selectors and change things through commands. See
   [architecture/COLLECTIONS.md](./architecture/COLLECTIONS.md).

One sentence: _the logic is written once; each platform keeps its own memory and
reads it its own way._

## Where things live in `packages/shared`

Canonical homes — one implementation per module, no duplicate trees and no
re-export shims:

| Concern                                                            | Home                                        |
| ------------------------------------------------------------------ | ------------------------------------------- |
| Backend clients, RPC wrappers, network shapes                      | `lib/backend/`                              |
| Supabase client construction                                       | `lib/createHavenSupabaseClient.ts`          |
| Domain logic (messaging, auth, notifications, voice, …)            | `features/<domain>/`                        |
| The session (`HavenCore`) and its event table                      | `collections/core/havenCore.ts`             |
| Collections, their selectors, kit (StatePort, requests, events)    | `collections/` (see COLLECTIONS.md)         |
| Device storage port + adapters; incoming links                     | `core/persistence/`, `core/linkPipeline.ts` |
| Platform capability port (`AppHost`)                               | `infrastructure/platform/appHost.ts`        |
| Themes (tokens, registry — the one place hex literals are allowed) | `themes/`                                   |
| Shared types, DB types                                             | `types/`                                    |

## Platforms

| Platform | Shell                       | UI                     | Core binding                    | Status                                     |
| -------- | --------------------------- | ---------------------- | ------------------------------- | ------------------------------------------ |
| iOS      | Expo dev client             | React Native (UniWind) | `HavenReactCore` (zustand)      | **Live** — TestFlight, custom OTA pipeline |
| Desktop  | Tauri v2 (Rust + WKWebView) | Solid                  | `HavenSolidCore` (Solid stores) | **Live** — signed releases                 |
| Web      | Vite (same Solid app)       | Solid                  | same as desktop                 | **Live** — Vercel                          |

Backend for all of them: Supabase (Auth, Postgres + RLS, Realtime, Edge Functions),
LiveKit Cloud for voice.

iOS updates its JavaScript over the air without EAS Update: a local toolchain
(`npm run mobile:ota:deploy`, `tooling/scripts/mobile/deploy-ota.sh`) hashes the
assets, builds the bundle and publishes it, and the `update-manifest` Edge
Function serves the Expo Updates manifest the app checks at launch. Update
hosting stays with the rest of the backend.

## Security

Every permission is decided in Postgres: an RLS policy on a table, or a check
inside a security-definer function. The apps never decide; they show what the
database returned. A modified client or a person with devtools gets exactly
what the policies allow and nothing more. Channel access, ban enforcement,
moderation visibility and who may reach whom all end there
([architecture/DATABASE.md](./architecture/DATABASE.md)).

That is why two things that look risky are safe:

- **The Supabase key in the apps is public.** It is the publishable anon key,
  and it can do only what the policies permit. The service role key never ships
  in an app. Voice credentials live in Edge Function secrets, and
  `voice-token` returns one only to a signed-in caller the database says may
  join (`get_voice_access`).
- **The source is public.** The schema, the policies, the migrations and the
  voice function are all in this repo. A security model that only holds while
  hidden doesn't hold.

To check it yourself: the client is built in
`packages/shared/src/lib/createHavenSupabaseClient.ts`, the policies are in
`supabase/migrations/`, the voice secret handling is in
`supabase/functions/voice-token/handler.ts`, and `npm run test:db` runs the
database's own tests of who may and may not do each thing.

## Realtime (one subscription)

Exactly **one** domain realtime subscription per user: `user:<id>` → the
core's event table → the collections. Feature code never opens its own
listener (voice presence, `voice:<channel id>`, is the documented exception).
What each event does: [architecture/REALTIME.md](./architecture/REALTIME.md).

## Guardrails (decisions, encoded)

| Guard                                                                     | Enforces                                                                                                                 | Why                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `check:shared-portable`                                                   | No react/solid/react-zustand, no browser globals in portable paths, no `use*` exports under `core/`                      | The three-layer law, mechanically                                                                           |
| `check:shared-hex`                                                        | No hex color literals in shared outside `themes/`                                                                        | Colors flow through the theme system                                                                        |
| `mobile:ownership`                                                        | Root must not own react/expo deps; mobile must not own solid/tauri/vite                                                  | Dependency ownership mirrors the layer split                                                                |
| `check:themes`                                                            | Theme bridge outputs match their source                                                                                  | Mobile themes are generated from shared tokens; drift = visual divergence                                   |
| `check:chat-surface` / `check:mobile-uniwind` / `check:mobile-typography` | Mobile UI conventions                                                                                                    | Theme/typography consistency on the live app                                                                |
| eslint boundary rules                                                     | UI/features can't build a backend or a Supabase client, touch device storage, or open realtime directly                  | Screens go through the core                                                                                 |
| solid-client shape boundaries (`boundaries/dependencies`)                 | One-way layer flow inside `packages/solid-client`; features isolated + barrel-only entry; no `@tauri-apps`/react imports | The committed desktop/web shape: [architecture/SOLID_CLIENT_SHAPE.md](./architecture/SOLID_CLIENT_SHAPE.md) |
| `mobile:bundle`                                                           | Headless Metro export resolves the whole mobile module graph                                                             | Catches broken imports/aliases in CI without a simulator                                                    |

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
dedicated milestone — with the empirical finding that tsconfig `paths` alone drive
Metro resolution today.

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

**Both repos in one window.** `haven.code-workspace` lists `../haven-site` as a
second folder. Zed keeps no folder list on disk, so open both from the
terminal: `zed ../haven ../haven-site` from either repo. (Each repo keeps its
own `.zed/settings.json`.)
