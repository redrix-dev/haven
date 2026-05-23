# Mobile Nexus-Direct Refactor Working Audit

Timestamp: 2026-05-23 15:00:02 EDT

This is a current working refactor list, not a final architecture contract. Keep it updated as the Nexus-direct migration lands, old wrappers are removed, and shared/web holdouts get proper Core/Nexus surfaces.

## Current Direction

Mobile should follow the Nexus-direct pattern shown by `NotificationPreferencesPanel`:

- UI components call `useHavenCore()`.
- Domain state is read from `core.<nexus>.use...()` selectors.
- Domain mutations call `core.<nexus>...()` or a `HavenCore` command.
- Missing domain commands should be added to Core/Nexus, not to mobile controller hooks or provider wrappers.

## Mobile Status

The mobile cutover is basically over the line. Mobile feature, screen, and navigation searches are clean for:

- Old mobile provider/controller names.
- Direct backend factory imports.
- Direct `@shared/nexus/*` imports.
- Direct `core.backends` usage.

The migrated mobile surfaces now use the intended pattern directly through `useHavenCore()` and Nexus/Core selectors/actions.

## Can Remove Now

- `apps/mobile/src/screens/main/CommunityScreen.tsx`
  - Current state: deprecated alias to `CommunityChatScreen`.
  - Search result: no active imports besides itself.
- Stale eslint quarantine entry:
  - `apps/mobile/src/haven-rev2/**`
  - Current state: folder no longer exists on disk.
- Deleted mobile context/controller files are no longer referenced:
  - `MobileNotificationsContext`
  - `MobileDirectMessagesContext`
  - `MobileMainSessionContext`
  - `MobileSocialWorkspaceContext`
  - `useFriendsModalData`
  - `useMobileServerAdminActions`
  - `useCurrentUserIdentity`
  - `HavenTabNavigator`

## Mobile Exceptions To Keep

These are acceptable host/platform or UI-only exceptions, not pattern violations:

- Auth/bootstrap:
  - `useAuthSession`
  - `mobileAuthService`
  - `getMobileSupabase`
  - MMKV persistence construction
- Native lifecycle:
  - Expo push token acquisition
  - Push tap listeners
  - VoIP foundation
  - File/image upload preparation
- UI-only stores:
  - `useUiStore`
  - push navigation store
  - chrome/bubble/sidebar stores
- Pure utilities and mappers that do not fetch or mutate data:
  - notification copy/filtering
  - invite code normalization
  - profile tombstone mappers
  - embed helpers

## Needs Design Before Old Stuff Can Die

### Web Chat Session Shell

`packages/web-client/src/chat-app/useChatAppSessionState.ts` still assembles backend/controller state directly.

Needed pattern work:

- Move web session data reads to `useHavenCore().<nexus>.use...()` selectors.
- Move business actions to Core/Nexus commands.
- Remove controller-style web session aggregation once consumers are direct.

### Voice

Shared/web voice still reaches through `core.backends.client` and `core.backends.voiceToken`.

Needed pattern work:

- Design a `VoiceNexus` or `core.voice` surface.
- Keep native/audio lifecycle code as lifecycle code.
- Move domain/session state and token fetching behind Core/Nexus commands/selectors.

### Moderation And Reporting

Remaining direct moderation/community backend usage exists in web moderation surfaces:

- `packages/web-client/src/components/moderation/DmReportReviewPanel.tsx`
- `packages/web-client/src/components/moderation/ServerModmailPanel.tsx`

Needed pattern work:

- Add a moderation/admin review Nexus surface.
- Expose report list/detail selectors.
- Expose review, resolve, delete-message, and server/user moderation commands through Core/Nexus.

### Feature Flags

Web still passes backend instances into `useFeatureFlags`.

Needed pattern work:

- Add `core.featureFlags` or equivalent.
- Expose flag loading/status selectors.
- Keep consumers from constructing or passing backend dependencies.

### Web Business Actions

Web still contains controller-style business actions for:

- invite joins
- attachment saves
- profile reports
- bans/kicks
- account settings saves
- theme preference saves
- member/channel permission saves

Needed pattern work:

- Move each domain action into the relevant Nexus/Core surface.
- Let UI call those commands directly.
- Delete controller wrappers once no consumer imports them.

### Community Permission Hydration Helper

Shared permission hydration helpers still exist and are acceptable as internal plumbing for now.

Needed pattern work:

- UI should call `core.ensureCommunityPermissions(...)` only.
- Once web no longer imports hydration helpers directly, make the helper private Core/Nexus plumbing or delete it.

## Verification Snapshot

Passing:

- `npm run lint`
- `npm run mobile:typecheck`
- `npm run typecheck`
- `git diff --check`
- Targeted Core/Nexus tests for bootstrap session, notifications, profile, and community admin

Known unrelated blocker:

- Full `npm run test:unit` is still failing in existing web React invalid-hook-call tests, not from the mobile Nexus-direct cutover.
