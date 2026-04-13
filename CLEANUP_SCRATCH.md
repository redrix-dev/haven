# Cleanup Scratchpad

Purpose: running list of unused, dead, or redundant code to clean later.

Updated: 2026-04-08

## Open candidates

- [ ] `packages/shared/src/app/hooks/useChatAppOrchestration.ts`
  - **Lines:** `1-819` (lint warning around `595`)
  - **Section:** Entire hook is oversized and likely contains extractable/dead-adjacent orchestration branches.
  - **Signal:** ESLint `max-lines` warning (`819` > `550`) from `npm run lint`.
  - **Notes:** Not dead code by itself, but prime hotspot for hidden redundancy and stale branches after refactors.

- [ ] `packages/shared/src/app/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration.ts`
  - **Lines:** `67-77`
  - **Section:** `handleServerAccessLossReset()`
  - **Potential redundancy:** `setWorkspaceMode("community")` is called twice (direct store call and injected setter).
  - **Notes:** Keep one canonical call path after behavior verification.

- [ ] `packages/shared/src/app/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration.ts`
  - **Lines:** `69` and `73`
  - **Section:** `handleServerAccessLossReset()`
  - **Potential redundancy:** `setCurrentChannelId(null)` is set directly, and `resetChannelsWorkspace()` also sets it to `null`.
  - **Notes:** Remove one path once we confirm there is no sequencing side effect.

- [ ] `packages/shared/src/app/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration.ts`
  - **Lines:** `141-150`, `156-159`
  - **Section:** `serverNameByIdRef` sync + lost-server-name fallback
  - **Potential redundancy:** map may duplicate data already available in `servers`; evaluate whether ref cache is still needed.
  - **Notes:** Might still be valid for race-safe toast naming after access loss, so treat as medium-confidence.

## Completed today

- [x] `packages/shared/src/stores/navigationStore.ts`
  - Removed dead duplicated navigation state: `currentServer` and `setCurrentServer`.

- [x] `packages/shared/src/features/community/hooks/useServers.ts`
  - Removed dead sync path that only maintained `navigationStore.currentServer`.

- [x] `packages/shared/src/app/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration.ts`
  - Removed stale reset call to `setCurrentServer(null)`.

- [x] `packages/shared/src/features/messaging/components/richComposer.tsx`
  - Added TipTap markdown bridge with html<->markdown conversion and underline mapping (`<u>` <-> `__text__`) for renderer parity.

## QA follow-ups

- [ ] `packages/shared/src/features/messaging/components/__tests__/MessageInput.test.tsx`
  - **Lines:** test runtime warnings (act-related, no assertion failures)
  - **Section:** dropdown interaction flow in toolbar menu test
  - **Potential issue:** redundant/noisy async UI update warnings
  - **Evidence:** Vitest stderr includes repeated "not wrapped in act(...)" warnings during menu open/select assertions.
  - **Notes:** Non-blocking for staging cut-over; tighten test synchronization later.

## Intake format for new findings

- [ ] `<path>`
  - **Lines:** `<start-end>`
  - **Section:** `<function/block>`
  - **Potential issue:** `<unused | dead | redundant>`
  - **Evidence:** `<lint/search/runtime observation>`
  - **Notes:** `<cleanup caveats or ordering constraints>`
