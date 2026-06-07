# Solid migration — handoff

Cold-start orientation for the Electron→Tauri / React→Solid foundation work. Read this first,
then the referenced docs.

## Where we are
- **Gate 1 = GO** — PoC proven (voice/WebRTC in WKWebView, Solid↔`@shared`, Supabase-in-webview).
- **Phase 2 (shared-core hardening) in progress** on branch **`feat/shared-core-hardening`** (off `staging`).
- **3a audit:** complete. **3b.1:** done (binding packages). **3b.2:** re-planned after a CI-gated revert (see below).

## Reference docs (read in this order)
- **`docs/tauri-solid-roadmap.md`** — phases, steps, decision gates, and the finalized/approved Phase 2 plan.
- **`docs/shared-core-audit.md`** — full shared-core inventory + the **3b.2 coupling discovery**.
- **`docs/tauri-solid-rebuild.md`** — original intent + React→Solid dependency mapping (Kobalte/virtua/etc.).
- **Approved Phase 2 plan:** `~/.claude/plans/reactive-mapping-mountain.md` (lives **outside** the repo).
- **Working agreement** (in project memory `project_tauri_solid_rebuild.md`): foundation-vs-hack — argue
  "do it right" only by showing *genuine* clarity, never to placate. Truthful advisor, not yes-man.

## The stash (throwaway probe code)
The dirty feasibility build (mic/voice/@shared probes + Tauri config tweaks) is **stashed**, not on this branch:
- `git stash list` → **`stash@{0}: On feat/tauri-solid-continued: tauri dirty probes (junk)`** (recover: `git stash apply stash@{0}`).
- It's **disposable** (nuke-on-exit) — all findings already live in the audit/roadmap. Originated on `feat/tauri-solid-continued`.
- ⚠️ stash indices shift; match by the message `"tauri dirty probes (junk)"`, not the index.

## Branch state (`feat/shared-core-hardening`)
- `4d8b491` — **3b.1**: new `packages/react-bindings` (`useStoreSelector`) + `packages/solid-bindings`
  (`fromStore`, `createStoreSelector`). Alias-only packages (tsconfig.base paths + tsconfig.web/apps-tauri
  includes + root & tauri vite aliases). Mobile babel/metro alias **not yet added** (deferred to first RN consumer).
- `50d7052` — corrected audit/roadmap after the 3b.2 finding.
- Base `Nexus.ts` is **untouched** (reverted to green). Typecheck is clean.

## Key decisions (don't re-litigate without reason)
- Core = `zustand/vanilla createStore`; reactivity lives in the binding packages, **not** in `shared`.
- Adapter topology: `packages/react-bindings` (web-client + RN) · `packages/solid-bindings` (solid-client + future solid-web).
  Trajectory: **web + desktop both go Solid**; RN is the lasting React consumer.
- 8 service classes rename `…Nexus` → `…ControllerNexus`; entity-cache classes keep `…Nexus`.
- Base `ControllerNexus.ts` extracted **after** pilots, from observed repetition (not imposed).

## ⚠️ 3b.2 finding (important)
"Fix base → 5 entity subclasses inherit" was **wrong**. The entity family is a **per-class loop**:
- Base `use<S>` is **used** by `CommunityMessageNexus` (`this.use()` ×5) — not dead. (`useAll`/`useOne` ARE dead.)
- 4 of 5 subclasses override `get store()` (extended shape) + call `useStore(this.store, …)`:
  Channel(3), Community(5), DirectMessage(3), Notification(5).
- → converting the base in isolation fails typecheck. Treat entity classes like service classes.

## Per-domain loop (the unit of work, CI-gated)
1. store `create`→`createStore`  2. relocate `useY()` hooks → `@react-bindings`  3. add `@solid-bindings`
equivalents  4. (service only) rename `…Nexus`→`…ControllerNexus` + composition wiring  5. migrate live
`core.X.useY()` call sites (web-client + RN + electron renderer)  6. **`npm run test:ci` + `npm run mobile:typecheck` green before next.**

## Next potential steps
1. **Entity family (per-class):** start with **`ChannelNexus`** (overrides store, no `this.use` — cleanest of the four),
   then Community / DirectMessage / Notification, then **`CommunityMessageNexus`** last (it drives the base `use<S>`;
   relocate that usage with it, then the base can drop `use<S>`/`useAll`/`useOne` and go fully zero-React).
2. **Service classes:** pilots `Permissions` → `Profile` → extract base `ControllerNexus.ts` → roll the remaining 6
   (Voice, Social, CommunityAdmin, CommunityModeration, Onboarding, FeatureFlag).
3. **stores/** (`auth`, `ui`, `userStatus`, `core/viewerMessagePolicy`) → vanilla + adapters.
4. **Binding hooks/context** (`AuthContext`, `useVoice`, `useVoiceMemberVolumes`, `useHavenCore`, `useDataCacheComponentProbe`).
5. **3c cleanups:** dedup `platform/` vs `infrastructure/platform/` (`urls.ts` identical; `appHost.ts` differs → reconcile).
6. Add the **mobile babel/metro alias** for `@react-bindings` at the first RN call-site migration.

**Exit (Phase 2):** `packages/shared` imports 0 React/solid-js · `check:shared-portable` passes · `test:ci` +
`mobile:typecheck` green · Solid smoke consumes the core via `@solid-bindings` · Electron/web still build → merge to `staging`.
