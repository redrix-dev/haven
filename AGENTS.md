# Agent Handoff

Haven is community chat for people who give a damn. Keep the product humane,
private by construction, and easy for a tired maintainer to understand cold.
When two correct options exist, choose the one you can explain plainly.

This file is the quick index. Load the relevant project skill under
`.claude/skills/` before changing code in that area.

## First Moves

- Treat `staging` as the integration truth. New feature/fix branches start from
  `staging`, not `main`; promotion to `main` only happens after staged signoff.
- Read [docs/PRINCIPLES.md](docs/PRINCIPLES.md) before architectural work.
  The prime rule is understandable correctness.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before moving state,
  adding shared logic, or changing app boundaries.
- If code and docs disagree, the code wins and the docs are fixed in the same
  change.
- Keep generated local artifacts out of commits: `dist/`, `test-reports/`,
  `.ota-export/`, `apps/mobile/ios/`, `apps/mobile/android/`,
  Supabase `.temp/`, and Supabase generated test users are local-only.

## Skill Index

| Task                                                                                                               | Load this skill                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Starting, scoping, testing, or handing off any change                                                              | [haven-branch-ci-gates](.claude/skills/haven-branch-ci-gates/SKILL.md)             |
| Changing `packages/shared`, backend clients, HavenCore contracts, realtime routing, or platform ports              | [haven-shared-core-boundary](.claude/skills/haven-shared-core-boundary/SKILL.md)   |
| Adding or changing a desktop/web Solid feature, route, UI primitive, or popout                                     | [haven-solid-feature-slice](.claude/skills/haven-solid-feature-slice/SKILL.md)     |
| Adding or changing a Solid data nexus/cache in `packages/solid-client/src/data`                                    | [haven-solid-nexus](.claude/skills/haven-solid-nexus/SKILL.md)                     |
| Writing or changing any Solid `createEffect`, store subscription, or realtime handler                              | [haven-solid-reactivity](.claude/skills/haven-solid-reactivity/SKILL.md)           |
| Changing the Tauri desktop shell, bridge, capabilities, deep links, updater bridge, persistence, or popout windows | [haven-tauri-desktop-shell](.claude/skills/haven-tauri-desktop-shell/SKILL.md)     |
| Changing desktop release workflow, updater signing, version sync, release notes, or packaged build behavior        | [haven-tauri-release](.claude/skills/haven-tauri-release/SKILL.md)                 |
| Changing Tauri/sidecar Rust dependencies, Cargo locks, sidecar staging, or platform-specific lockfile churn        | [haven-tauri-cargo-lockfiles](.claude/skills/haven-tauri-cargo-lockfiles/SKILL.md) |
| Changing the live Expo mobile app outside the chat keyboard shell                                                  | [haven-mobile-live-app](.claude/skills/haven-mobile-live-app/SKILL.md)             |
| Changing mobile community/DM chat layout, composer clearance, or RNKC keyboard behavior                            | [haven-mobile-chat-surface](.claude/skills/haven-mobile-chat-surface/SKILL.md)     |
| Changing Supabase migrations, RLS, RPCs, Edge Functions, fixtures, SQL tests, or backend contract tests            | [haven-supabase-rls](.claude/skills/haven-supabase-rls/SKILL.md)                   |
| Changing Linux native voice, the Tauri voice process host, or the `VoiceBridge` protocol                           | [haven-native-voice-sidecar](.claude/skills/haven-native-voice-sidecar/SKILL.md)   |

## Repo Map

- `apps/mobile` - React Native + Expo app in active TestFlight use. React,
  Expo, generated native projects, UniWind, and mobile-only native concerns live
  here.
- `apps/tauri` - Tauri v2 desktop shell and bootstrap for the shared Solid
  client.
- `apps/web` - Vite static web shell for the same Solid client.
- `packages/shared` - portable domain logic, backend clients, shared types,
  themes, and realtime routing. No React, no Solid, no platform cache.
- `packages/solid-client` - Solid UI, Solid-native caches, desktop/web
  composition root, and feature slices.
- `supabase` - migrations, RLS policies, Edge Functions, fixtures, helpers, and
  SQL regression suites.
- `tooling` - repo checks, mobile wrappers, Supabase test runners, release
  signoff/report scripts, and shared test support.

## Guardrails That Matter

- `npm run test:cleave` is the fast merge floor: lint, shared portability,
  typecheck, mobile typecheck, mobile bundle smoke, and unit tests.
- `npm run test:ci` adds `test:db` and `test:backend`; use it for DB/shared
  behavior changes.
- `npm run mobile:release:check` gates mobile release work.
- `npm run check:themes` proves generated theme bridge outputs are current.
- `npm run check:agent-skills` validates tracked agent skill frontmatter and
  links without Python dependencies.
- `cargo build --locked --manifest-path apps/tauri/haven-voice/Cargo.toml`
  proves the Linux native voice sidecar still resolves and links.

## Footguns To Avoid

- Do not put permission decisions in UI. Security lives in Postgres RLS or
  security-definer RPCs; clients reflect database truth.
- Do not share reactive memory across frameworks. Share pure logic in
  `packages/shared`; keep React and Solid caches per-platform.
- Do not create Supabase clients, call RPCs, or open domain realtime channels in
  UI/features. Use host bootstrap, HavenCore, backend clients, and nexuses.
- Do not import features from other features in `packages/solid-client`.
  Shared code moves down into `data/`, `components/ui/`, or `packages/shared`.
- Do not add `@tauri-apps/*` to `packages/solid-client`; the Solid client must
  run in Tauri and a plain browser tab.
- Do not add root React/Expo dependencies or mobile Solid/Tauri dependencies.
  `mobile:ownership` enforces the split.
- Do not update one resolver for a path alias. Aliases are mirrored across
  tsconfig, Babel, Metro, and Vitest until workspace package exports replace
  them.
- Do not edit generated mobile native folders as the source of truth. Edit Expo
  config/plugins/templates, then prebuild.
- Do not commit staged Tauri sidecar binaries from
  `apps/tauri/src-tauri/binaries/`; that folder is generated for bundling and
  gitignored.
- Do not accept Cargo lockfile churn from the wrong platform without review.
  Windows can prune Linux-only sidecar edges; Linux can add them back.
- Do not split desktop release creation across matrix jobs. One draft release
  is created up front and all platforms upload to its numeric id.
- Do not ship a packaged Tauri build without `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` present at build time.

## Known Rough Edges

- Path aliases are an interim compatibility layer. The durable target is real
  workspace packages with `exports`.
- Some shared selectors still live under `@shared/nexus/*` while others live
  under `@shared/features/*/logic`. Follow the existing domain imports; do not
  consolidate as drive-by cleanup.
- `revision` fields still exist in shared nexus state because mobile types need
  them. Solid nexuses should initialize them but not read or increment them.
- Realtime still has documented holes for reactions, attachments, and link
  previews; see [docs/architecture/REALTIME.md](docs/architecture/REALTIME.md).
- Desktop Linux voice has two overlapping bridge concepts (`VoiceBridge` and
  `VoiceRuntimeBridge`). Use the documented `VoiceBridge` seam for the sidecar;
  consolidate only when a real third surface needs it.
- Desktop voice popout routing exists, but the launcher is hidden until
  cross-window sync moves off BroadcastChannel and onto a Tauri-safe event path.
