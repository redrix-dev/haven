# Mobile TODO

Working notes for the next mobile-focused maintenance pass.

## Hook lint cleanup

`npm run lint` currently reports seven `react-hooks/exhaustive-deps` warnings in
mobile. They are warnings, not runtime test failures.

### Findings

1. `apps/mobile/src/components/HavenModalShell.tsx:112`
   - Missing dependency: `cardTranslateY`.
   - Low risk. This is a Reanimated shared value and is stable in practice.

2. `apps/mobile/src/components/HavenModalShell.tsx:141`
   - Missing dependencies: `cardTranslateY`, `offscreenTranslateY`,
     `scrimOpacity`, `startCloseAnimation`.
   - Medium risk if fixed naively. `startCloseAnimation` is recreated every
     render today, so adding it directly would make the effect churn. Stabilize
     `completeClose` and `startCloseAnimation` first.

3. `apps/mobile/src/components/HavenNavbar.tsx:63`
   - Missing dependency: `pulse`.
   - Low risk. Reanimated shared value; adding it should be harmless.

4. `apps/mobile/src/components/ui/skeleton.tsx:21`
   - Missing dependency: `sv`.
   - Low risk. Same Reanimated shared-value pattern.

5. `apps/mobile/src/features/direct-messages/DirectMessagesContainer.tsx:354`
   - Unnecessary dependency: `liveProfiles`.
   - Low risk. `renderConversation` only uses `otherLabel`, and `otherLabel`
     already depends on `liveProfiles`; remove the redundant dependency.

6. `apps/mobile/src/features/direct-messages/DmInboxDrawer.tsx:215`
   - Missing dependency: `liveProfiles`.
   - Real but narrow stale-data risk. `renderFriend` directly resolves live
     names/avatars from `liveProfiles`; add it to the dependency list.

7. `apps/mobile/src/features/user-profile/AppUpdatesCard.tsx:128`
   - Unnecessary dependencies: `checkError`, `downloadError`.
   - Low risk. `statusLabel` reads `latestError`, so keep `latestError` and
     remove the redundant source variables.

### Proposed fix order

1. Simple dependency cleanup:
   - Add `pulse` and `sv`.
   - Add `liveProfiles` to `DmInboxDrawer.renderFriend`.
   - Remove redundant `liveProfiles` from
     `DirectMessagesContainer.renderConversation`.
   - Remove `checkError` and `downloadError` from
     `AppUpdatesCard.statusLabel` dependencies.

2. Handle `HavenModalShell` separately:
   - Wrap `completeClose` and `startCloseAnimation` in `useCallback`.
   - Add the real dependencies to the modal effects.
   - Re-test parent-driven close, scrim close, and interrupted open/close
     animation behavior.

3. Optional polish:
   - For `Skeleton`, consider cancelling the repeated Reanimated animation on
     unmount with `cancelAnimation(sv)`. This is not required for the lint
     warning, but it is tidier.
