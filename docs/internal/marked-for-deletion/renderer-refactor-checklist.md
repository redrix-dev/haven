# Renderer Refactor Checklist

This checklist tracks the phased renderer decomposition + entrypoint folderization refactor.

## Refactor Policy

- Default rule: no behavior changes in refactor PRs.
- If a behavior change is necessary, call it out explicitly in the PR and include validation notes.
- Prefer small, shippable slices over broad rewrites.

## Baseline (Captured Before Refactor)

- `src/renderer.tsx` size: ~173 KB (`173140` bytes)
- `useState` calls: `44`
- `useEffect` calls: `32`
- `async function` declarations: `63`

## Per-Phase Automated Checks

- `npx tsc --noEmit --project tsconfig.json`
- `npx eslint "src/**/*.{js,ts,tsx}"`

## Per-Phase Manual Smoke (Core Community Chat + Channels)

- Login and load app
- Select server
- Select channel
- Send message
- Edit message
- Delete message
- React / unreact
- Scroll and load older messages
- Open server settings
- Open server members modal
- Create channel
- Rename channel
- Delete channel
- Create channel group
- Rename channel group
- Delete channel group
- Assign channel to group
- Remove channel from group
- Leave server (cancel + confirm)
- Delete server (cancel + confirm)

## Spot Checks (Every 2-3 Phases or When Touched)

- Notifications panel and mark actions
- Friends / DM workspace open + send DM
- Voice join / switch / leave
- Account settings + updater status read/check
- Native text context menu in text inputs

## Phase Tracking

- [ ] Phase 0: Baseline + safety rails
- [ ] Phase 1: Entrypoint folderization
- [ ] Phase 2: Renderer bootstrap split
- [ ] Phase 3: Cross-cutting app constants/types/utils extraction
- [ ] Phase 4: Session + desktop hooks
- [ ] Phase 5: Community workspace decomposition
- [ ] Phase 6: Messages extraction
- [ ] Phase 7: Notifications/social/DM extraction
- [ ] Phase 8: Voice extraction
- [ ] Phase 9: Main entry cleanup
- [ ] Phase 10: Preload cleanup
