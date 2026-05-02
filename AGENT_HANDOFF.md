# Haven — agent handoff & engineering context

**Purpose:** Give any coding agent (or human) enough **ground truth**, **history**, and **routing** to work productively without rediscovering architecture.  
**Maintainer intent:** Keep the **top summary** token-efficient; use the **long form** for narrative, nuance, and “why we did it this way.”

**Repo:** `https://github.com/redrix-dev/haven` (private; reference only).  
**Snapshot:** ~239 commits on `HEAD` as of document creation; **verify** with `git rev-list --count HEAD`. Root commit: `a1a264b` — *Initial Haven baseline* (2026-02-17).

---

## 1) Token-friendly summary (read this first)

### What this project is

- **Haven** — multi-surface product: **Electron desktop** (primary shipping surface for a long time), **Vite web** assets, **Expo / React Native mobile** (`apps/mobile`), and a large **`packages/shared`** TypeScript layer.
- **Backend:** **Supabase** (Postgres, Auth, Realtime, Storage, RPCs). Migrations live under **`services/supabase/migrations`** (authoritative for this repo’s workflow; root `supabase/migrations` may mirror — see `.cursor/rules/000-repo-reality.mdc`).

### Non-negotiable architecture facts

1. **Not** a single Expo Router app on mobile — **`apps/mobile` uses React Navigation** (stack + custom tab navigator). Do not assume Router file-based routing.
2. **`packages/shared`** is the **portable** domain + hooks + Zustand stores + `lib/backend/*` facades. CI **`npm run check:shared-portable`** blocks import-time Supabase singletons, raw `process.env` Supabase keys in shared, and **web-only imports** in designated portable paths.
3. **Platform escape hatch:** `packages/shared/src/platform/appHost.ts` + per-app **`setAppHost`** (e.g. `apps/mobile/src/lib/registerMobileAppHost.ts`) so shared code can open URLs, etc., without assuming Electron or `window`.
4. **Path aliases (mobile `tsconfig`):** `@shared/*` → `packages/shared/src/*`, `@platform/*` → `packages/shared/src/platform/*`, `@client/app/*` → `packages/shared/src/app/*`, `@shared/app/ui/*` → `packages/web-client/src/app-ui/*` (shared UI primitives pulled for some surfaces).

### Where to look by task (high signal)

| Task | Start here |
|------|------------|
| Community chat, messages, composer (RN) | `apps/mobile/src/screens/main/CommunityScreen.tsx`, `.../useMobileCommunityMessages.tsx`, `apps/mobile/src/components/HavenComposer.tsx` |
| Parity with desktop chat UX | `packages/shared/src/features/messaging/components/MessageList.tsx`, `useMessages` hook, desktop modals under `packages/shared/src/features/community/components/` |
| Auth (mobile) | `apps/mobile/src/auth/mobileAuthService.ts`, `apps/mobile/src/hooks/useAuthSession.ts`, `RootNavigator.tsx` |
| Navigation shell / modals | `apps/mobile/src/navigation/HavenTabNavigator.tsx`, `apps/mobile/src/components/HavenModalShell.tsx` |
| Server / channel admin (mobile) | `apps/mobile/src/features/community/settings/MobileServerSettingsModal.tsx`, `MobileChannelSettingsModal.tsx`, `useMobileServerAdminActions.ts` |
| Permissions / mod mail gates | `packages/shared/src/features/community/communityPermissionsHydration.ts`, `packages/shared/src/stores/permissionsStore.ts`, mobile `useMobileCommunityPermissionsHydration.ts` |
| Backends / RPC contracts | `packages/shared/src/lib/backend/*.ts`, `packages/shared/src/lib/backend/types.ts` |
| DB / RLS / migrations | `services/supabase/migrations/` |
| Desktop / Electron | `apps/electron/`, webpack entry via root `package.json` scripts |
| Web client | `packages/web-client/`, `apps/web/` |
| Mobile push | `apps/mobile/src/hooks/useMobileExpoPushRegistration.ts`, `apps/mobile/docs/push-notifications-runbook.md` |
| CI / quality gates | Root `package.json` scripts: `typecheck`, `lint`, `check:shared-portable`, `test:unit`, `test:db` |

### Workflow patterns that actually stuck

- **“Parity” migration:** Mobile community UX was often brought up by **copying behavior from desktop/shared** (same hooks/backends), not reinventing APIs on the device.
- **Checkpoint commits:** Many commits named `checkpoint before …` — deliberate **save points** before risky refactors; bisect-friendly.
- **Smallest viable change** (also codified in `.cursor/rules/000-repo-reality.mdc`): avoid repo-wide migrations unless asked.

### Known splits / tech debt to respect

- **Two modal systems on mobile:** Custom **`HavenModalShell`** (Reanimated slide + scrim) vs native **`Modal` + `presentationStyle="pageSheet"`** for some community settings — different gesture physics (iOS native sheet vs custom).
- **`CommunityScreenTest` / deprecated:** `apps/mobile/src/screens/deprecated/OLDCommunityScreen.tsx` exists as history; confirm which screen is live in `RootNavigator` before editing.

### Operational commands

- **Repo root:** `npm run typecheck`, `npm run test:ci`, `npm run mobile:start` (delegates to `apps/mobile` via `tooling/scripts/mobile/run-in-mobile.mjs`).
- **Mobile only:** `cd apps/mobile && npm run typecheck`.

### Docs elsewhere

- `apps/mobile/TESTFLIGHT_READINESS.md` — release-oriented sweep notes (if present).
- `apps/mobile/README.md` — mobile-specific setup.
- `.cursor/rules/000-repo-reality.mdc` — **always-on** agent rule for this repo.

---

## 2) Long-form narrative

### 2.1 Inception and repository shape

The git root **`Initial Haven baseline`** establishes the monorepo mindset early: shared TypeScript, Electron packaging, and web tooling coexist at the top level. The **product `package.json`** (`name: "haven"`) is oriented around **Electron Forge** (`electron-forge start`, `make`, `publish`) and **Vite** for web (`dev:web`, `build:web`). That ordering reflects **desktop-first shipping**, with web and automation as first-class siblings — not “mobile app with a server.”

**Authoring:** `git shortlog` shows two identities (`redrix-dev` vs `Redrix` email formatting) — same lineage, but agents grepping history should use **`git log --all --author`** patterns carefully.

### 2.2 Git history as a story (phases)

History is **not** evenly spaced: there is a **dense February–April desktop/refactor period**, an **Expo / RN uplift thread**, and an **April 2026 “inline parity” marathon** for mobile community UX.

**Phase A — Early baseline (post-root commits)**  
Immediately after the root, commits include **README updates**, **semver releases** (`release: v1.0.x`, `v1.1.x`), and **hotfixes** (debug panel, signup username, voice). That establishes the **release cadence** and **Electron wrap** as the commercial spine.

**Phase B — Refactor / extraction**  
Commits such as *decompose renderer app into community/admin hooks* and *complete phase 7 social notifications dms* show a deliberate **split** between UI shells and **hooks + shared stores** — the same architecture agents now rely on in `packages/shared`.

**Phase C — React Native / Expo thread**  
A branch narrative appears in history: `feat/react-native-base`, **Expo SDK 52 → 53**, **RN 0.76 → 0.79**, then **Enriched Markdown** integration for mobile. This is a **capability investment** (rich text parity) with pain visible in commit messages (*keyboard pain*, *d609ddd*) — typical RN iteration.

**Phase D — “Inline parity” (Apr 26, 2026 cluster)**  
A **large batch** of commits advances **mobile community** toward **desktop-like** behavior. Recurring verbs in subjects:

- **`migrate … to inline parity path`**
- **`checkpoint before …`** (explicit rollback points)
- Concrete wins: **long-press message actions**, **reply metadata**, **channel switcher modal**, **report hardening**, **media / attachment** pipeline fixes (Blob → **ArrayBuffer** at storage boundary, **FileReader** fallback when `Blob.arrayBuffer` missing), **portable UUID** instead of `crypto.randomUUID` in shared paths, **ImagePicker API** migration.

This phase is the **template for how Haven approaches mobile:** **shared contracts first**, then **RN-specific fixes** at the boundary (storage, binary data, permissions).

**Phase E — Layout / UX polish**  
*Discord-style chat list geometry*, **jump-to-latest** as a **list overlay** (not inside composer), keyboard gating — shows attention to **scroll + keyboard + hit-testing** (fade unmount to avoid touch artifacts). These are **Haven-specific UX decisions** (not generic RN boilerplate).

**Phase F — Shell & TestFlight (late Apr – May 2026)**  
Commits: **align ts versions**, **RNKC + RNEM** (keyboard controller + enriched markdown baseline), **modal shell wiring**, **repo structure cleanup**, **mobile modal contents**, **file upload fixes**, **TestFlight release prep**. This is the **productization** layer: modals, ownership of safe areas, and release hygiene.

### 2.3 Patterns that stuck (and why they work here)

**1) Shared `lib/backend` facades**  
Feature code tends to call **`getCommunityDataBackend`**, **`getControlPlaneBackend`**, etc., initialized from **`initializeHavenDataFromClient`** with a Supabase client. That keeps **RPC names and types** in one place (`types.ts`) and lets **Electron, web, and mobile** share orchestration logic.

**2) Zustand stores in `packages/shared/src/stores`**  
Navigation, permissions, servers, live profiles, etc., are **not** reimplemented per platform. Mobile subscribes the same way desktop does (with different UI).

**3) `AppHost` indirection**  
Mobile registers a minimal host (`registerMobileAppHost`) so shared code does not call `window.open` or assume browser storage. **Extend** the host when adding downloads or deep platform behavior — do not spray `Linking` through `packages/shared` ad hoc.

**4) “Parity” as a workflow**  
When adding a mobile feature, the **fastest correct** approach is often: **read desktop** (`MessageList`, `CommunityChatModals`, `useChatAppBusinessActions`) → **reuse hook/backend** → **build RN shell** (`HavenModalShell` or `pageSheet` Modal). This reduced **contract drift** during the Apr 2026 sprint.

**5) Checkpoint commits**  
Frequent `checkpoint before …` commits are **boring to read** but **valuable for git bisect** and psychological safety on large UI refactors. New work can follow the same pattern for risky changes.

**6) Tooling guardrails**  
- **`check:shared-portable`** — keeps Metro and shared tests honest about **DOM/Radix** and **env** boundaries.  
- **`tooling/scripts/mobile/preflight.mjs`** — verifies mobile deps and **Reanimated Babel plugin** before dev-client runs.  
- **Root `mobile:*` scripts** — always run mobile commands through **`run-in-mobile.mjs`** so cwd and installs stay consistent.

**7) Cursor “Repo Reality” rule**  
The file **`.cursor/rules/000-repo-reality.mdc`** exists because **generic skills** (Expo Router, etc.) **conflict** with this repo. Agents should read it before imposing framework defaults.

### 2.4 Patterns that did not fully converge (and why that is OK)

**1) Dual modal implementations**  
`HavenModalShell` provides a **consistent Haven-styled** bottom card for settings / inbox / DMs. Some flows (e.g. **community server settings**) use **`Modal` + `presentationStyle="pageSheet"`** for **native iOS** sheet physics. Unifying **either** on custom Reanimated **or** all-native sheets would be a **product decision** (gesture parity vs one component API). Neither path is “wrong” today.

**2) `CommunityScreenTest` naming / deprecated screen**  
There is evidence of iterative rewrites (`OLDCommunityScreen`, “known-good baseline” commits). Agents should **confirm the active route** in `RootNavigator` / `HavenTabNavigator` before large edits.

**3) Console logging in infrastructure paths**  
Some **warn** paths remain in push registration, VoIP foundation, and post-delete sign-out — **operational** rather than user-facing. Long-term, these should move to a **structured logger**; they are not blockers for an internal build (see prior team discussion).

**4) Voice on mobile**  
Native **CallKeep / VoIP** foundation exists behind env flags; full **voice UX parity** with desktop is **not** assumed. The repo includes **WebRTC** and **VoIP push** bridges — treat as **incremental**.

### 2.5 Supabase and migrations culture

- **Migrations** under `services/supabase/migrations/` are extensive (community, DMs, moderation, reports, push, profile identities, etc.).
- **Repo scripts:** `check:migrations-parity`, `test:db` — agents changing schema must **follow established workflow** (not invent a second migration directory).

### 2.6 Testing culture

- **Vitest** unit tests exist under `packages/shared/.../__tests__` and related areas; root `test:unit` enumerates globs.
- **Contract tests** exist for several backends (`*.contract.test.ts`).
- **DB / RLS** — `test:db` and SQL suites — are **part of full CI** (`test:all` / `test:ci`).

Agents should **run the narrowest test** for their change before proposing a broad `test:all`.

### 2.7 Local / uncommitted work caveat

Git history does **not** capture **in-flight editor work** or **uncommitted** files. If the user mentions a feature that **does not appear** in `git log`, check **`git status`** and ask whether to treat workspace files as source of truth. Session-based mobile parity work sometimes lands as **large untracked batches** before commit.

### 2.8 Desktop (Electron) and web — how they fit

The **authoritative product surface** for many features is still the **Electron shell**: `apps/electron/` with **main process** code (`src/main/`), **preload** bridge (`src/preload/desktop-bridge.js`, `index.js`), and **renderer** (`src/renderer/index.tsx`). IPC handlers register under `src/main/ipc/`. Desktop-specific capabilities (window chrome, auto-update, file saves, voice popout) are **not** available on mobile; they flow through **`AppHost` bridges** and types under `packages/shared/src/platform/`.

**Vite web** (`dev:web` / `build:web` with `apps/web/`, `packages/web-client/`) provides a **web build** path. Mobile **reuses** some UI via the **`@shared/app/ui/*` → `packages/web-client/src/app-ui/*`** alias only where the build allows — this is **not** “Next.js app router”; it is a **Vite** + shared components story. When in doubt, **read `tsconfig.web.json`** and the **import graph** of the file you are editing.

**Implication for agents:** A feature that “works on desktop” may live in **shared hooks** *or* in **Electron-only** shims. Before porting to mobile, verify **where state lives** (Zustand store vs window-only).

### 2.9 Orchestration: desktop’s “spine” vs mobile’s “slices”

On desktop, **`useChatAppOrchestration.ts`** and related **lifecycle / elevation** effects wire together auth, servers, messages, voice, and deep links. Mobile does **not** run the full Electron orchestration tree; instead it **composes a smaller set** of providers in `RootNavigator` (`MainTabs`): notifications, social workspace, DMs, **plus** mobile-only hooks (`useMobileExpoPushRegistration`, `useMobileVoipFoundation`, `useServersRealtimeBootstrap`, `useMobileCommunityPermissionsHydration`).

**Pattern:** When you need **business behavior** (send message, report, invite, permissions), prefer **`packages/shared` hooks and backends** that desktop also uses. When you need **UI structure**, copy from **desktop components** as *reference*, then implement **RN** (`HavenModalShell`, `pageSheet` `Modal`, or plain screens).

### 2.10 NativeWind, Reanimated, and keyboard stack (mobile)

**NativeWind** (`global.css`, `className` on RN components) is the **styling currency** in `apps/mobile`. **Reanimated** + **react-native-gesture-handler** are required dependencies; **do not** strip the Reanimated Babel plugin. **`react-native-keyboard-controller`**’s `KeyboardProvider` wraps the app in `App.tsx` and interacts with composer focus — keyboard-related bugs often require reading **both** the composer (`HavenComposer.tsx`) and **list** scroll props.

### 2.11 Exemplar “parity” workflow (step-by-step)

When asked to add a **community or messaging** feature on mobile:

1. **Find the desktop truth** — `MessageList.tsx`, `CommunityChatModals.tsx`, or `useChatAppBusinessActions.ts` (invite/join patterns, etc.).  
2. **Find the contract** — `packages/shared/src/lib/backend/types.ts` and the relevant `*Backend.ts`.  
3. **Find existing RN wiring** — `CommunityScreen.tsx`, `HavenComposer.tsx`, `ChannelSwitcherModal.tsx`.  
4. **Decide shell** — quick settings-style flow: consider **`pageSheet`** for native iOS feel; **tab-level modals** often use **`HavenModalShell`**.  
5. **Permissions** — if UI is gated, ensure **`hydrateCommunityPermissionsForMany`** has run (mobile hook in `RootNavigator`) so `permissionsStore` is not empty.  
6. **Binary / media** — use **ArrayBuffer** at the upload boundary when touching storage; **avoid** assuming web `File` or `crypto.randomUUID` in shared portable code.

---

## 3) Agent operating manual (practical)

### 3.1 Before writing code

1. Read **`.cursor/rules/000-repo-reality.mdc`**.  
2. Classify the task: **shared portable** vs **mobile-only** vs **electron-only**.  
3. Find **desktop or shared reference** for parity features.  
4. Run **`npm run check:shared-portable`** if touching `packages/shared` portable paths.

### 3.2 When touching mobile

- Confirm **Gesture Handler** import order in `App.tsx` and **`GestureHandlerRootView`** wrap (already present).  
- After dependency changes in `apps/mobile`, **`npm ci`** in `apps/mobile` and **`npm run typecheck`**.  
- **Preflight** (`mobile:preflight` or `apps/mobile` script) before native builds.

### 3.3 When touching Supabase

- **RLS and security** are non-negotiable; follow **`supabase` skill** guardrails but **reconcile** with repo migration process.  
- Prefer **RPCs already mirrored** in `lib/backend` over ad hoc client queries in features.

### 3.4 Style expectations (from project norms)

- **Smallest diff** that solves the problem; avoid drive-by refactors.  
- **Match existing naming** in the touched package (mobile Tailwind/NativeWind class patterns vs shared React DOM).  
- **Avoid** new markdown files unless the user asked — **this handoff** is an explicit exception.

---

## 4) Revision log

| Date | Note |
|------|------|
| (created) | Initial handoff from repo exploration + `git log`; long section ~10–15 printed pages at ~350–450 words/page depending on layout. |

---

**End.** Update this file when major architecture shifts (e.g. Expo Router adoption, unified modal library, or new first-class app surface).
