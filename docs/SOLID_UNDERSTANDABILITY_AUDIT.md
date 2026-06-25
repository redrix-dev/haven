# Solid rebuild understandability audit

Captured 2026-06-13 as a reference note for keeping the desktop/web rebuild
legible while it is still cheap to change the bones.

## Goal

The rebuild should be easy for a new contributor to reason through without
repeating the retired Electron failure mode: large role-organized files where
every feature had a legitimate reason to accumulate. The opposite failure mode
is also explicitly rejected: a maze of tiny abstractions and small files that
hide the actual flow.

The desired shape is a small number of obvious rooms:

- Backend contracts define what exists.
- Domain caches own entity lifecycles.
- One controller/composition root routes session bootstrap and realtime events.
- UI surfaces read domain state and call domain commands.
- Feature folders may be internally flexible, but a route entry should read like
  a table of contents.

## Current read

The Solid client is in a healthier place than the old Electron client:

- `App.tsx` is still small.
- `routes/` is the screen registration point.
- `features/` are vertical slices, and ESLint blocks cross-feature imports.
- `data/<domain>/` follows a consistent cache/accessor/barrel shape.
- `HavenSolidCore` is the single session composition root and realtime target.

The main risk is inside newer large vertical slices. A few files are starting to
hold view layout, async orchestration, mutation busy/error state, presentational
sections, and display helpers all together:

- `features/direct-messages/DirectMessagesView.tsx`
- `features/friends/FriendsView.tsx`
- `data/direct-messages/directMessageSolidCache.ts`
- `contexts/VoiceProvider.tsx`

Some large files are acceptable when the responsibility is singular. For example,
`HavenSolidCore` being the composition root and realtime switchboard is legible.
The concern is not line count by itself; it is mixed reasons to change.

## Suggested convention

Use a "few obvious rooms" convention inside each feature:

- `FeatureView.tsx`: route entry, params, top-level accessors, top-level
  loading/error, composition of major sections.
- `createFeatureController.ts`: only when async workflows, busy keys, mutation
  notices, or search flows start dominating the view.
- `FeatureSection.tsx`: large visible areas, not microscopic components.
- `featureViewModel.ts`: pure formatting, grouping, sorting, summary helpers, or
  state-to-view-model translation.
- `index.ts`: public feature surface only.

Do not force identical subfolders into every feature. Split only when it makes a
new reader's path shorter.

## Concrete cleanup targets

- Direct messages:
  - Split the view into `ConversationList`, `DmConversation`, `DmComposer`, and
    `DmReportDialog`.
  - Move display and grouping helpers into a small view-model module.
  - Keep the route file as the story of the screen, not the whole screen.
- Friends:
  - Split by tab: friends, add, requests, blocked.
  - Consider a small controller for search/mutation busy state if it grows.
- Direct message cache:
  - Move stale/latest-message merge, preview, and timestamp helpers into pure
    cache logic.
  - Prefer `@shared` if mobile needs the same rules.
- Voice:
  - Keep `VoiceProvider` as the public provider, but extract LiveKit room
    lifecycle and DOM audio element management into internal helpers.

## Nexus alignment question

The mobile Nexus shape was effective because entity lifecycle stayed domain
scoped, while one core routed session bootstrap and realtime events into those
domains. The Solid rebuild mostly kept that model in intent, but the current
names and UI-first growth pattern make it easier to blur the line:

- `*SolidCache` maps to mobile `*Nexus`, but the naming makes it sound like a
  passive storage layer rather than a domain controller.
- UI slices sometimes call multiple domain caches and own multi-step workflows
  directly.
- Some domain-specific logic is still in UI files because screens were built as
  vertical slices before their internal seams settled.

A cleaner backend-contract-upward shape would be:

```
@shared backend contract
  -> @shared domain logic
  -> solid-client domain controllers/caches
  -> HavenSolidCore session + realtime router
  -> feature controllers
  -> feature views
```

This is close to the current design, but it should be made more explicit in
future work.

## Internal tooling proposal

Build a small custom `features/devtools` surface first, with optional adapters
later. Off-the-shelf tools can inspect framework/router/query internals, but the
valuable Haven debug surface is its own domain caches, realtime routing, bridge
capabilities, and voice/window state.

Recommended shape:

- Route: `/_debug`
- Optional dock/overlay enabled by `VITE_HAVEN_DEVTOOLS=1`
- Production enablement later via feature flag and platform-staff gate
- Read-only by default; mutating tools require explicit per-panel opt-in

Panel registry:

```ts
type DevtoolsPanel = {
  id: string;
  label: string;
  section: "state" | "realtime" | "ui" | "shell";
  render: () => JSX.Element;
};
```

First panels:

- Caches: domain cache state, loading/error/revision, counts, selected snapshot
  JSON with redaction.
- Realtime: last routed events, handler target, reloads triggered, failures.
- Voice: LiveKit connection state, active channel, BroadcastChannel mirror
  state, popout mode.
- Router/session: route, bootstrap phase, provider branch, session state.
- Feature flags: loaded flags and source once Solid feature flags are ported.
- UI/shell: active theme variables, viewport/window mode, bridge capabilities.

Do not make product features import devtools. The devtools feature should read
the core and cache debug metadata from below, so debugging does not infect
product code.

## Near-term order

1. Decide whether Solid domain classes should continue as `*SolidCache` or shift
   toward a Nexus-like name before more surface area lands.
2. Refactor direct messages and friends into the "few obvious rooms" convention.
3. Port Solid feature flags from mobile's `FeatureFlagNexus`.
4. Add read-only internal devtools with cache snapshots.
5. Add realtime and voice panels.
