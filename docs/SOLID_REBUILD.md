# The Tauri + Solid rebuild — active plan

The live plan for replacing the retired Electron/React desktop and web clients with
a Tauri shell and a Solid UI on the cleaved architecture. Updated as phases land;
completed phases get one line and a pointer to the archive.

> **Pause point (2026-06-12):** [SOLID_BUILD_HANDOFF.md](./SOLID_BUILD_HANDOFF.md)
> snapshots the build state, the open platform-direction question (webview feel
> vs. native bar), the experiments queued to answer it, and the hard constraints
> that survive any direction change. Read it before resuming work.
>
> **Understandability guardrail (2026-06-13):**
> [SOLID_UNDERSTANDABILITY_AUDIT.md](./SOLID_UNDERSTANDABILITY_AUDIT.md)
> records the audit on large-file risk, Nexus alignment, and the proposed
> internal desktop/web devtools suite.

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
  direct-messages, notifications, messages, community-management (members),
  profile (viewer profile)**. The rest are added per the
  [`data/README.md`](../packages/solid-client/src/data/README.md) rule — _an
  accessor is written when a screen first needs to read that domain_, so a missing
  one is by-design, not debt.
- **Session stores** (auth, ui, userStatus, viewerMessagePolicy) built.

**Milestone 1 (2026-06-11) — app shell + community text chat — landed.** The dev
harness (`DevLogin`, `ThemePlayground`, placeholder CSS) is gone; what exists now:

- **Routes**: `/sign-in`, `/` (auth-guarded `AppLayout`) → home redirect,
  `/community/:communityId[/channel/:channelId]`, `/settings/appearance`. The URL
  is the source of truth — `CommunityRouteSync` writes cache active-ids from
  params, never the reverse.
- **`components/ui/`**: Kobalte-based Button/TextField/Avatar/Tooltip + the
  `Markdown/` chat renderer (marked lexer → Solid token renderer; `||spoiler||`
  as an inline extension mirroring the shared parity contract; html tokens
  render inert; hrefs protocol-filtered — no innerHTML, no sanitizer needed).
- **Community chat slice**: virtua-virtualized message list behind a view-model
  seam (canvas renderer can swap in later), grouped rows + date dividers, reply
  context, plain-textarea composer (`normalizeCommunityMarkdown` before send),
  `ensureInitialLoaded`/`loadOlder` pagination with shift-prepend, realtime
  inserts via the already-routed core. Members panel via the fleshed
  `CommunityAdminSolidCache`.
- **Theme lifecycle** (`contexts/ThemeProvider.tsx`): boot from localStorage,
  viewer-profile hydration wins, optimistic select with revert, persisted via
  `profiles.updateViewerProfile` so mobile follows. Applying a theme writes
  primitive **and resolved semantic** vars — the Tailwind bridge maps utilities
  to semantic vars only, so UI code must use semantic utilities (`bg-card`, not
  `bg-surface-2`; the latter silently generates nothing).

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
2. **Application shape committed + enforced — ✅ done (2026-06-10).** The folder
   shape, dependency law, and window model for the UI build are decided and
   documented in
   [architecture/SOLID_CLIENT_SHAPE.md](./architecture/SOLID_CLIENT_SHAPE.md)
   (the Electron god-renderer postmortem lives there too). Enforcement is live
   before the first screen exists: the "Solid client shape boundaries" section of
   `eslint.config.mjs` (`eslint-plugin-boundaries`) fails lint on cross-feature
   imports, upward imports, non-barrel feature entry, and any
   `@tauri-apps`/react import inside `solid-client`. `features/`, `routes/`, and
   `components/ui/` are scaffolded with READMEs stating their contracts.
3. ~~**"Dumb UI behind login" playground.**~~ Superseded — milestone 1 went
   straight to real vertical slices on the same plumbing.
4. **Real screens as vertical slices — in progress.** ✅ community channel chat
   (the meatiest slice — messages cache + realtime end to end), ✅
   settings/appearance, ✅ **voice (2026-06-12)**: `VoiceSolidCache` is a 1:1
   port of mobile's VoiceNexus (presence/kick channels, token fetch);
   `contexts/VoiceProvider.tsx` owns the LiveKit Room (Solid port of
   `useMobileLiveKitVoiceSession`, plus web audio-element management and
   autoplay-blocked handling); sidebar voice rows join on click and show live
   occupants via presence; `VoiceDock` (mute/deafen/leave/popout) renders
   under the sidebar. **First popout landed**: `/popout/voice` +
   `bridge.openPopout` (Tauri `WebviewWindow` / browser `window.open`);
   cross-window sync = mirror + remote-control over BroadcastChannel —
   decision record in the shape doc § window model. Hard-won lesson recorded
   in `voiceSync.ts`: BroadcastChannel payloads must be PLAIN objects — Solid
   store proxies fail structured clone, and the DataCloneError unwinds out of
   whatever store write triggered the broadcasting effect. Not yet in voice:
   PTT/voice-activity gating, per-member volumes, device pickers in UI (the
   controller supports switching), kick UI. **Direct messages started
   (2026-06-13):** Solid DM cache now has mobile-parity load/send/open/read +
   realtime latest-message merge behavior covered by stale-state tests; the
   first `/direct-messages[/conversationId]` route renders the conversation
   inbox, active thread, text/image send, image previews, live-profile
   names/avatars, friend-backed new conversation picker, report-message flow,
   and URL-driven active conversation. Still missing from DM parity:
   edit/delete/reaction message actions, richer friend request/search flows,
   and the mobile floating bubble flavor. **Friends/social surface landed
   (2026-06-13):** `/friends` renders the mobile-equivalent friends, add,
   requests, and blocked tabs against the Solid social cache, with friend
   search, request send/accept/decline/cancel, unblock, refresh/error states,
   live-profile names/avatars, and DM handoff to `/direct-messages/:id`. Next
   slices, in order: **notifications** (toasts arrive here —
   `solid-sonner`), then message actions parity (edit/delete/reactions — the
   cache methods that currently throw) and the tiptap composer upgrade. Perf note:
   `livekit-client` puts the bundle at ~1.07 MB — lazy-loading the voice path
   is the obvious first code-split when perf work begins.
5. **Shell capabilities.** Map the `AppHost` bridge surface
   (`packages/shared/src/infrastructure/platform/appHost.ts`) onto Tauri
   `invoke()` commands as features need them: window chrome, updater, deep links
   (`haven://`), notifications, file save.

**Solid-ism to design around:** Solid tracks reactivity at access time — any
accessor taking a reactive argument takes it as a getter (`() => communityId`), not
a plain value, so it re-subscribes when the value changes.

## React → Solid mapping (for the UI build)

Carried from the spike evaluation; ✅ = adopted and in the tree.

| Need                  | Solid choice                                 | Notes                                           |
| --------------------- | -------------------------------------------- | ----------------------------------------------- |
| Core                  | `solid-js`                                   | Components run once; signals, not hooks         |
| Headless primitives   | ✅ `@kobalte/core`                           | Replaces radix; API differs                     |
| Icons                 | ✅ `lucide-solid`                            | Near drop-in                                    |
| Toasts                | `solid-sonner`                               | Install with the notifications slice            |
| Virtualized chat list | ✅ `virtua/solid`                            | `shift` handles prepend; seam allows swap       |
| Rich text editor      | `@tiptap/core` + manual Solid binding        | Tiptap core is framework-agnostic               |
| Markdown              | ✅ `marked` lexer + own Solid token renderer | No innerHTML; spoilers via inline extension     |
| Image crop            | wrap a vanilla lib                           | No 1:1 port — known gap                         |
| Command palette       | `cmdk-solid` or build on Kobalte             | **Verify maintenance** before adopting          |
| Gestures              | `@use-gesture/vanilla` + wrapper             |                                                 |
| Auto-update           | `@tauri-apps/plugin-updater`                 | Same GitHub-releases flow the Electron app used |

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
