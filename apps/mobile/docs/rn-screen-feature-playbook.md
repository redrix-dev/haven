# React Native Screen + Feature Build Playbook

This guide is for building new mobile screens in this repo with minimal refactor risk.

Goals:
- Reuse shared systems first (`packages/shared`) and only add mobile-specific code when required.
- Use consistent screen scaffolding (loading/error/empty/content) and data ownership.
- Decide state location (local vs Zustand vs backend) before coding UI.
- Use realtime only when the feature actually needs live updates.

---

## 1) Pre-build questions (ask before coding)

Use this as your intake checklist for every new screen.

### A. Screen purpose
- What is the one primary user action on this screen?
- Is it mostly read-only, mostly input, or both?
- What should happen if network is slow/offline?

### B. Data + ownership
- What data is needed to render first paint?
- Which data already exists in shared backends/hooks?
- Does this screen mutate data, or only read?
- What should persist when the user leaves and returns?

### C. Navigation
- What params are required to enter the screen?
- Should state come from route params, Zustand, or both?
- What is the back behavior if opened from a deep link?

### D. Realtime needs
- Does this UI become stale quickly without subscriptions?
- Can a focus refresh (or pull-to-refresh) be enough?
- If realtime is needed, what exact events should trigger UI updates?

### E. UI states
- Loading state?
- Empty state?
- Error state?
- Partial update state (e.g., cached content + background refresh)?

If you cannot answer these in 5-10 minutes, do not code yet. Clarify first.

---

## 2) Architecture decision tree (if/then)

### Data source
- If shared backend already exposes required query/mutation -> reuse it.
- If shared backend does not expose it but query is product-wide -> add to shared backend.
- If logic is mobile-only presentation (layout transforms, temporary grouping) -> keep in mobile screen/hook.

### State placement
- If state is temporary and single-screen (open section, input draft, modal flags) -> local `useState`.
- If state is needed across screens/session and not server-owned -> Zustand store in `packages/shared/src/stores`.
- If state is server-owned and should survive app restarts/devices -> backend + fetch/hydrate.

### Realtime strategy
- If correctness requires immediate updates (chat timeline, channel membership changes) -> subscribe.
- If freshness can wait until user revisits screen -> `useFocusEffect` refresh.
- If high event volume but low UX value -> poll/focus refresh, not realtime.

### Shared-first boundary rule
- Start from `packages/shared/src/lib/backend/*` and shared feature hooks.
- Add thin mobile adapters only for platform APIs (`Linking`, notifications, storage, auth session wiring).
- Avoid copying business logic into `apps/mobile`.

---

## 3) Existing patterns in this repo to mirror

### Home screen fetch pattern
`apps/mobile/src/screens/HomeScreen.tsx` already follows a good baseline:
- `initialLoad`, `refreshing`, `loadError`
- `useFocusEffect` for refresh-on-focus
- shared query helper `listUserCommunitiesWithClient(...)`

### Shared query helper pattern
`packages/shared/src/lib/listUserCommunitiesWithClient.ts`:
- Accepts injected client + user id
- Returns typed data (`ServerSummary[]`)
- Keeps query knowledge out of mobile UI

### Navigation/auth root pattern
`apps/mobile/src/navigation/RootNavigator.tsx`:
- Session gate at root
- Route-level branching by auth state
- Side concerns (password recovery flow, push registration) handled near root, not scattered into screens

### Store shape pattern
`packages/shared/src/stores/serversStore.ts`:
- Small focused state
- explicit setters
- `reset()` for teardown

Use these as templates for new features.

---

## 4) Standard implementation order (for new screens)

Follow this order to reduce rework:

1. Define route contract
- Add route in `apps/mobile/src/navigation/types.ts`
- Decide required params and nullability

2. Define data contract
- Identify backend calls in shared (or add one)
- Define minimal screen-ready types

3. Choose state boundaries
- Local screen UI state vs shared Zustand state
- Document this in comments at top of screen file

4. Build screen shell first
- Header
- Safe area
- 4-state body: loading/error/empty/content

5. Integrate data fetch
- Initial load + pull/focus refresh
- Error normalization (`getErrorMessage`)

6. Add navigation actions
- Route transitions for major user actions

7. Add realtime only if required
- Subscribe in effect
- Idempotent update path
- Clean unsubscribe on unmount/server change

8. Add performance guardrails
- List virtualization settings
- Stable callbacks
- Avoid unnecessary store subscriptions

9. QA checklist pass
- Cold start
- Return-to-screen
- Offline/error
- Empty and populated states

---

## 5) `CommunityScreen` blueprint (thorough example)

Use this as a concrete walkthrough when a user taps a community tile on `Home`.

### A. Entry contract

Question set:
- Do you navigate with only `communityId`, or include `communityName` for faster header paint?
- Should this screen restore last channel visited?
- Should we deep-link directly to a channel?

Recommended route contract:
- `Community: { communityId: string; initialChannelId?: string }`

### B. Screen sections (display questions)

Ask these before finalizing layout:
- Header: show community avatar/name only, or add member count + quick actions?
- Channel rail: full grouped list or flat list?
- Chat surface: newest at bottom with inverted list, or oldest at top?
- Composer: single-line grow, attachments, and send affordance behavior?
- Input persistence: should draft survive app background or screen switch?

### C. Data + realtime questions

- Channels: fetch once per community, or refetch on every focus?
- Messages: paginated by cursor? page size?
- Realtime events needed:
  - new message inserted?
  - message updated/deleted?
  - channel permission changes?
  - member ban/revocation events?

If yes to permission/membership events, mirror patterns from:
- `packages/shared/src/features/community/hooks/useCommunityWorkspace.ts`

### D. Suggested state split

Local `useState`:
- composer text
- attachment picker visibility
- transient UI toggles (emoji picker open, scroll-to-bottom button visible)

Zustand shared store:
- active community/channel ids (if used by multiple screens)
- cached channel lists by community
- unread counters / mention badges

Backend/server state:
- messages, channels, permissions, membership

### E. Suggested file layout

- `apps/mobile/src/screens/CommunityScreen.tsx`
- `apps/mobile/src/hooks/useCommunityScreenData.ts` (mobile orchestration only)
- Shared-first:
  - reuse `@shared/lib/backend/*`
  - reuse `@shared/stores/*`
  - reuse shared feature hooks if RN-safe

### F. Example build sequence for `CommunityScreen`

1) Route and navigation:
- Add `Community` route in `RootStackParamList`
- On home tile press: `navigation.navigate("Community", { communityId: item.server.id })`

2) Data hook:
- Build `useCommunityScreenData(communityId)` that exposes:
  - `channels`, `messages`, `loading`, `error`
  - `actions.refresh()`, `actions.sendMessage()`, `actions.selectChannel()`

3) Initial hydration:
- Fetch channels first
- Resolve default channel (last visited -> first text -> first any)
- Fetch first message page for selected channel

4) Realtime:
- Subscribe on selected channel/community change
- Merge incoming events into local cache/store
- Unsubscribe in cleanup every time selection changes

5) UI rendering:
- Header (safe area aware)
- Channel list panel/rail
- Message list surface with virtualized list
- Composer anchored to bottom with keyboard avoidance

6) Failure handling:
- If channels fail but cached channels exist -> render cached + inline warning
- If first load fails and no cache -> full-page retry CTA

### G. “If this then that” flow examples

- If user has zero channels -> show empty state + “Create channel” CTA.
- If selected channel deleted via realtime -> auto-select next available text channel.
- If user loses channel permission -> show revoked state and route to next accessible channel.
- If send fails -> optimistic bubble gets error state + tap-to-retry.
- If reconnect after offline -> refresh latest page + reconcile pending sends.

---

## 6) Realtime integration checklist (use only when needed)

- Define event scope (community-level vs channel-level).
- Keep one active subscription per scope key.
- Normalize all payloads to shared types before applying.
- Deduplicate events by message id/event id.
- Ensure cleanup on:
  - channel change
  - community change
  - screen blur/unmount
- Log subscription lifecycle in dev.

Reference pattern: `useCommunityWorkspace` subscribes and cleans up on dependency changes.

---

## 7) Styling and layout checklist (RN-first)

- Safe area padding applied at top + bottom.
- Keyboard interaction tested on iOS and Android.
- `FlatList`/`SectionList` used for long lists (not mapped `ScrollView`).
- Empty/loading/error states use consistent spacing and tone.
- Press targets >= 44x44.
- Text truncation/line clamping for headers and long names.
- Theme token usage consistent (`bg-surface-*`, `border-*`, text tokens).

For community tiles/images specifically:
- Keep tile component API image-ready from day one:
  - `title`
  - `imageUrl?: string`
  - `fallbackInitial`
  - `onPress`
- Render fallback initial while image loads/fails, so server image wiring is additive.

---

## 8) Refactor prevention rules (the “clean first time” rules)

- Do not start with UI-only mock state if backend contract is known.
- Keep fetch/subscription logic in a hook, not inline in render body.
- Keep route params minimal and stable (ids > full objects).
- Avoid duplicating shared business rules in mobile files.
- Add one small store slice at a time; do not create mega-stores.
- Build explicit loading/error/empty states before polish work.

---

## 9) PR readiness checklist (copy/paste)

- [ ] Route type added and validated at compile time
- [ ] Screen has loading/error/empty/content states
- [ ] Data logic is in shared layer or thin mobile adapter
- [ ] State ownership is explicit (local vs store vs backend)
- [ ] Realtime used only where justified
- [ ] Subscription cleanup verified
- [ ] Pull-to-refresh or focus-refresh behavior defined
- [ ] List performance checked with realistic data volume
- [ ] Accessibility basics (roles/labels/hit area) verified
- [ ] Happy path + 2 failure paths tested on device/emulator

---

## 10) Quick starter template for future screens

Use this mini-template when creating a new screen:

1. Define route params.
2. Write 5-answer intake (purpose/data/nav/realtime/states).
3. Implement shell with 4 states.
4. Add shared-backed data hook.
5. Add refresh behavior.
6. Add navigation actions.
7. Add realtime only if required.
8. Run PR checklist.

If you follow this order, refactors become targeted improvements instead of structural rewrites.
