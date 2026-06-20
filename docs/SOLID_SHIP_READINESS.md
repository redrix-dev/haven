# Solid client — ship-readiness audit (2026-06-20)

A systematic sweep of `packages/solid-client/src` for missing/incomplete work,
cross-referenced against what mobile ships. The question this answers: **what's
truly missing, what does it cost, and what actually blocks a build.**

## Headline

**There are no crash blockers.** The core loop runs end-to-end (verified live
this session: sign-in → bootstrap → communities → channels → text + image chat →
message actions → voice join/leave/sounds → DMs → friends). Every "not
implemented" stub is **dormant** — nothing calls it, so it can't crash a build;
it just means that feature is absent. So the app is shippable as a **core beta**,
with three genuinely-missing subsystems and a polish list, all listed below.

## ✅ Works (verified)

- Auth + bootstrap (`rehydrating → … → ready`), realtime connected
- Communities, channels, members panel
- Community chat: text send, realtime, pagination, markdown, **image attach +
  inline render** (wired this session), **edit/delete/react/report** (wired this
  session)
- Voice: join/leave, mute/deafen, presence, popout (buttons fixed this session),
  **join/leave/notification sounds** (wired this session)
- DMs (incl. media, report), Friends
- Profile (nexus), Theme lifecycle

## ⛔ Truly missing — real features that don't exist (NOT crash blockers; dormant)

| Feature | State | Cost | Notes |
| --- | --- | --- | --- |
| **Feature flags** | `featureFlagSolidCache.load` throws; **not called** anywhere | Small — port from mobile (~50 loc) | Gating logic inert. Decide if anything must be flag-gated at launch. |
| **Onboarding** | `onboardingSolidCache.load`/`complete` throw; **not called** | Small — port from mobile (~44 loc) | New-user onboarding flow absent. Blocks first-run UX, not existing users. |
| **Community moderation actions** | `communityModerationSolidCache` is an empty stub class; **not called** | Medium — port from mobile | Ban/kick/redact actions don't function. Admin cache (members) DOES work. |

## 🟡 Polish / deferred (not blocking a build)

- **Sound settings policy** — sounds play, but with hardcoded volume/no
  enabled-toggle/focus-awareness. The shared `notifications/utils/sound.ts` has
  the proper policy; integrating needs the `@platform` alias + an audioSettings
  source. (Follow-up from this session.)
- **Loading skeletons** — boot splash exists; real per-surface skeletons unbuilt.
- **Cache persistence** — `rehydrate()` is a no-op in channels/communities/DM/
  notifications (deliberate later phase). No offline/persisted state.
- **Community display-order persistence** — the *read* path works
  (`orderedCommunities`); the *write* side (`setDisplayOrder`/`reset`) isn't
  ported. No drag-to-reorder yet, so nothing calls it.
- **Voice extras** — PTT / voice-activity gating, per-member volume, device
  picker UI, kick UI, STAFF badge on own optimistic sends.
- **Tiptap composer** — plain textarea for now (rich editing is a later slice).
- **Notifications toasts** (`solid-sonner`) — counts work; in-app toast surface
  is a next slice.

## 🔧 Refactor backlog (NOT a feature gap — these work today)

9 domains still use the old `XSolidCache` + accessors pattern (they function;
converting to the cohesive nexus is the grounding pass, not a ship requirement):
**community-management, direct-messages, feature-flags, messages, notifications,
onboarding, permissions, social, voice.** Converted so far: **channels,
communities, profile.**

## Tsconfig / infra notes (from the 2026-06-16 audit, still open)

- Inert project `references` (no `composite`), mobile-data double-included under
  two module systems, `@platform`/`@mobile-data` `paths` drift (bit us wiring
  sounds), broad `allowJs`.

## The ship call

- **Can you ship the core?** Yes — it runs, nothing crashes.
- **What's the honest gap?** Three absent subsystems (feature flags, onboarding,
  moderation) — all small/medium ports from mobile — plus the polish list.
- **Recommended order to "shippable":** (1) decide if feature-flags/onboarding
  block *your* launch (they may not, for an existing-user beta); (2) port
  whichever do; (3) port moderation if mod tools are launch-critical; (4) polish
  (skeletons, sound settings) as time allows; (5) nexus conversions continue in
  the background — never on the ship critical path.
