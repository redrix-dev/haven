# HavenReactCore hook audit

Post-cleave inventory (updated 2026-06-08). Shared domain hooks and reactive caches are **gone
from `packages/shared`**. Mobile owns selector-hooks, voice hooks, and auth context.

Each remaining hook is classified as:

| Verdict               | Meaning                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| **Existing cache**    | Domain state or actions belong on a cache we already have                   |
| **New cache / slice** | Warrants a new cache or formal HavenReactCore session slice                 |
| **Truly belongs**     | React lifecycle, platform bridge, or UI composition — keep as hook/provider |
| **Selector-hook**     | `@mobile-data/hooks` — binds React to cache `reactiveStore`                 |

See [HAVEN_CORE.md](./HAVEN_CORE.md) for orchestration rules and cache registry.

---

## What was deleted (historical cleanup + cleave)

### Shared domain hooks removed (pre-cleave)

`useMessages`, `useDirectMessages`, `useNotifications`, `useServers`, `useServerOrder`,
`useServerAdmin`, `useChannelManagement`, `useMessageNexus`, `useLiveProfiles`, … — replaced by
cache reads + HavenReactCore commands.

### Cleave relocations (2026-06)

| Was in shared                       | Now                                           |
| ----------------------------------- | --------------------------------------------- |
| `useVoice`, `useVoiceMemberVolumes` | `apps/mobile/src/features/voice/hooks/`       |
| `useAuth` (`AuthContext`)           | `apps/mobile/src/contexts/AuthContext.tsx`    |
| `useHavenCore`, `useBootstrapPhase` | `apps/mobile/src/data/core/useHavenCore.ts`   |
| `useDataCacheComponentProbe`        | `apps/mobile/src/debug/`                      |
| Cache `use*` methods on classes     | `apps/mobile/src/data/hooks/*` selector-hooks |

### Legacy stores removed

`dmStore`, `notificationsStore`, `socialStore`, `voiceStore`, `liveProfilesStore` — superseded by caches.

---

## Selector-hooks (`apps/mobile/src/data/hooks/`)

**Pattern:** hooks take the cache/nexus as the first argument (or derive it from `core` at the
call site). They use `useStoreSelector` + shared pure selectors/projections.

| Hook module         | Examples                                                          | Bound to                   |
| ------------------- | ----------------------------------------------------------------- | -------------------------- |
| `community.ts`      | `useCommunities`, `useActiveCommunityId`, `useOrderedCommunities` | `CommunityNexus`           |
| `channels.ts`       | `useChannels`, `useActiveChannelId`, `useChannelsLoading`         | `ChannelNexus`             |
| `messages.ts`       | `useChannel`, **`useVisibleChannel`**, `useChannelMeta`           | `CommunityMessageCache`    |
| `directMessages.ts` | `useDmConversations`, `useDmMessages`                             | `DirectMessageNexus`       |
| `notifications.ts`  | `useNotifications`, `useNotificationCounts`                       | `NotificationNexus`        |
| `social.ts`         | `useFriends`, `useCounts`, `useFriendRequests`                    | `SocialNexus`              |
| `profiles.ts`       | `useProfilesRecord`, `useViewerProfile`, `usePlatformStaff`       | `ProfileNexus`             |
| `permissions.ts`    | `usePermissions`                                                  | `PermissionsNexus`         |
| `voice.ts`          | `useVoiceSession`, …                                              | `VoiceNexus`               |
| `admin.ts`          | `useServerPanelState`, …                                          | `CommunityAdminNexus`      |
| `onboarding.ts`     | `useCampaigns`, …                                                 | `OnboardingNexus`          |
| `moderation.ts`     | `useReports`, …                                                   | `CommunityModerationNexus` |

**Anti-pattern:** `core.social.useFriends()` — removed from cache classes.

---

## HavenReactCore accessors

| Hook                | Verdict                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `useHavenCore`      | **Truly belongs** — registry accessor; returns `HavenReactCore`      |
| `useBootstrapPhase` | **Truly belongs** — reactive bootstrap phase (via Core subscription) |

Location: `apps/mobile/src/data/core/useHavenCore.ts`

---

## Mobile domain / platform hooks (`apps/mobile`)

| Hook / provider                    | Verdict                         | Notes                                                                              |
| ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `AuthContext` / `useAuth`          | **Truly belongs**               | Pre-core auth; Supabase → `bootstrapSession` / `clearSession`                      |
| `useVoice`                         | **Split**                       | Reads `core.voice`; owns WebRTC/session effects. Location: `features/voice/hooks/` |
| `useVoiceMemberVolumes`            | **Existing cache → VoiceNexus** | Host-persisted volume prefs                                                        |
| `useAuthSession`                   | **Truly belongs**               | Mobile session reader                                                              |
| `useMobileExpoPushRegistration`    | **Truly belongs**               | Native push token lifecycle                                                        |
| `useHydrateMobileThemeFromProfile` | **Truly belongs**               | RN theme from profile                                                              |
| `useMobileLiveKitVoiceSession`     | **Truly belongs**               | LiveKit + mobile voice bridge                                                      |
| `MobileMainSessionContext`         | **Split**                       | Shrink toward direct Core + selector-hooks at landing screens                      |
| `useMobileServerAdminActions`      | **Existing cache → core.admin** | Collapse into direct `core.admin` calls when touched                               |
| `useFriendsModalData`              | **Split**                       | Reads `SocialNexus`; keep search UI state local                                    |

---

## Shared (`packages/shared`) — no domain React hooks remain

`packages/shared/src/features/*/hooks/` domain hooks are **removed**. Shared may still export
pure functions and types. Voice hooks are **not** in shared.

Debug: `useDataCacheComponentProbe` moved to `apps/mobile/src/debug/`.

---

## Web host glue (`packages/web-client`) — quarantined

Web/electron React is **not maintained** post-cleave. The hooks below are historical inventory;
do not extend them — rebuild desktop on Solid.

| Hook                         | Verdict                               | Notes                          |
| ---------------------------- | ------------------------------------- | ------------------------------ |
| `useChatAppSessionState`     | **Transitional / frozen**             | Quarantined with web typecheck |
| `useChatAppLifecycleEffects` | **Truly belongs** (when rebuilt)      | Lifecycle only                 |
| Other `useChatApp*` slices   | **Shrink or delete on Solid rebuild** |                                |

---

## UI / debug hooks (keep on mobile)

| Hook                                               | Verdict                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| `useChatComposerColors`, chat surface chrome hooks | **Truly belongs** — styling/layout                        |
| `useDataCacheComponentProbe`                       | **Truly belongs** — debug only (`apps/mobile/src/debug/`) |
| `PasswordRecoveryGateContext`                      | **Truly belongs** — mobile auth gate                      |

---

## Recommended new caches (optional)

| Candidate                            | Owns                                    | Why not existing?                                |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------ |
| **PlatformNexus** (or session slice) | Feature flags, platform staff bootstrap | `useFeatureFlags` patterns on web (future Solid) |
| **SettingsNexus** (low priority)     | Unified app settings across hosts       | Split across Electron IPC / localStorage today   |

Do **not** create caches for: navigation interactions, deep links, push routing, WebRTC,
theme CSS sync, composer chrome.

---

## Priority queue (mobile, post-cleave)

1. **Shrink mobile session contexts** — landing `useEffect`s + direct selector-hooks
2. **`useMobileServerAdminActions` → direct `core.admin`** when editing call sites
3. **`useVoice` split** — cache owns session snapshot; hook owns media/effects only
4. **`useFriendsModalData` search → SocialNexus** — keep modal UI state local

**Not on mobile queue:** reviving web `useChatAppSessionState` — Solid rebuild instead.

---

## HavenReactCore orchestration (mobile)

| API                                                          | Role                                         |
| ------------------------------------------------------------ | -------------------------------------------- |
| `prepareTextChannelMessages(communityId, channelId)`         | Policy + revoked authors + message page load |
| `prepareDirectMessageConversation(conversationId, options?)` | DM thread load + optional mark-read          |
| `refreshCommunities(userId)`                                 | Reload community list + access-loss sync     |
| `syncFocusFromRoute(...)`                                    | Focus-driven channel/DM prep                 |
| `syncViewerMessagePolicy(communityId?)`                      | Viewer message visibility policy             |
| `syncNotificationSounds`                                     | In-app notification sound playback           |

Cache extensions live under `apps/mobile/src/data/` — e.g. `CommunityMessageCache`
(sendWithMedia, ensureInitialLoaded), `DirectMessageNexus` (openConversation), `NotificationNexus`
(preferences, inbox mutations), `CommunityAdminNexus` (`core.admin`).

---

## See also

- [HAVEN_CORE.md](./HAVEN_CORE.md) — composition root contract
- [MOBILE_NEXUS_DIRECT_REFACTOR_AUDIT.md](./MOBILE_NEXUS_DIRECT_REFACTOR_AUDIT.md) — remaining mobile cleanup
- [../solid-migration-handoff.md](../solid-migration-handoff.md) — cleave completion + Solid next steps
