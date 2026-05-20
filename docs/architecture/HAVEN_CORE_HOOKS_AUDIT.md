# HavenCore hook audit (May 2026)

Post-migration inventory after eliminating shared domain hooks (`useMessages`, `useDirectMessages`, `useNotifications`, `useServers`, `useServerOrder`, `useServerAdmin`, `useChannelManagement`, and related legacy stores).

Each remaining hook is classified as:

| Verdict | Meaning |
|---------|---------|
| **Existing nexus** | Domain state or actions belong on a nexus we already have |
| **New nexus** | Warrants a new nexus or formal HavenCore session slice |
| **Truly belongs** | React lifecycle, platform bridge, or UI composition — keep as hook/provider |

See [HAVEN_CORE.md](./HAVEN_CORE.md) for orchestration rules and nexus registry.

---

## What was deleted (this cleanup)

### Shared domain hooks removed

| Deleted hook | Replaced by |
|--------------|-------------|
| `useMessages` | `CommunityMessageNexus` + `core.prepareTextChannelMessages` |
| `useDirectMessages` | `DirectMessageNexus` + `core.prepareDirectMessageConversation` |
| `useNotifications` | `NotificationNexus` + `syncNotificationSounds` |
| `useServers` | `CommunityNexus` + `core.refreshCommunities` / `deriveCommunitiesLoadStatus` |
| `useServerOrder` | `CommunityNexus.useOrderedCommunities` + `core.setCommunityDisplayOrder` |
| `useServerAdmin` / `useChannelManagement` | `CommunityAdminNexus` (`core.admin`) |
| `useChannelGroups` | `ChannelNexus` |
| `useMessageNexus` | `CommunityMessageNexus` |
| `useLiveProfiles` | `ProfileNexus` |
| `useCurrentServerPermissionUi` | `PermissionsNexus` selectors at call sites |
| `useChatAppOrchestration` | `useChatAppSessionState` + controller slices + direct nexus reads |

### Legacy stores removed

`dmStore`, `notificationsStore`, `socialStore`, `voiceStore`, `liveProfilesStore` — superseded by nexuses.

### Web-only transitional hooks removed

`useCommunityChannelMessaging`, `useWebDirectMessages`, `useWebNotificationSession` — inlined at landing surfaces.

---

## Shared domain hooks (`packages/shared`)

| Hook | Verdict | Notes |
|------|---------|-------|
| `useVoiceSessionController` | **Truly belongs** | WebRTC, media devices, room-scoped realtime signaling. Documented voice exception. Largest voice file; extract non-React modules over time, not a nexus move. |
| `useVoice` | **Split** | Reads `core.voice` but also owns `voiceSessionStore` reducer, keyboard PTT, join prompts, panel UI flags. **VoiceNexus** should own session snapshot + active channel ref; hook keeps effects/listeners only. |
| `useVoiceMemberVolumes` | **Existing nexus → VoiceNexus** | Host-persisted per-participant volume prefs — same class as community display order. |
| `usePlatformSession` | **Existing nexus → ProfileNexus** | Loads *viewer* profile (username, avatar, theme, staff). `ProfileNexus` today is live identities for *others* only. Extend with `loadViewerProfile()` / `useViewerProfile()`. |
| `useFeatureFlags` | **New nexus** | `PlatformNexus` or `SessionConfigNexus`: `loadFlags()`, `useFlags()`, `hasFlag()`. Load in `bootstrapSession`. |
| `useNotificationInteractions` | **Truly belongs** (thin) | Notification kind → navigation + mark-read. Domain in `NotificationNexus`; shell routing glue. Future: `HavenCore.handleNotificationTap()` + host navigate callback. |
| `useDirectMessageInteractions` | **Truly belongs** (thin) | Workspace open, DM user, block — navigation + toasts. |
| `useAuth` (`AuthContext`) | **Truly belongs** | Pre-core auth boundary; wires Supabase → `bootstrapSession` / `clearSession`. |

`features/community/hooks/`, `features/messaging/hooks/`, `features/notifications/hooks/`, `features/direct-messages/hooks/` — **empty** (no shared domain hooks remain except voice + interaction glue).

---

## HavenCore accessors

| Hook | Verdict |
|------|---------|
| `useHavenCore` | **Truly belongs** — registry accessor |
| `useBootstrapPhase` | **Truly belongs** — reactive bootstrap phase |

---

## Web host glue (`packages/web-client`)

| Hook | Verdict | Notes |
|------|---------|-------|
| `useChatAppSessionState` | **Transitional god-hook** | ~970 LOC. Composes nexuses + controller hooks. Target: lifecycle/platform only; surfaces read `core.*`. Highest-priority shrink candidate. |
| `useChatAppLifecycleEffects` | **Truly belongs** | Logout/server-clear resets, prefetch on mount. |
| `useChatAppAccessAndBroadcastOrchestration` | **Existing nexus + HavenCore** | Registers `communityAccessHandlers`, access-loss cascades. Move to HavenCore commands; hook keeps registration + toasts only. |
| `useChatAppBusinessActions` | **Split → surfaces / admin nexus** | Join invite, save attachment, profile update. Inline in modals or `core.admin`. |
| `useChatAppConfirmationHandlers` | **Truly belongs** | Confirm-dialog wrappers around admin actions. |
| `useChatAppElevationEffects` | **Existing nexus → PermissionsNexus** | Elevation flags on server/voice focus → `permissions.syncElevationForFocus()` from `syncFocusFromRoute`. |
| `useChatAppVoiceIntegration` | **Truly belongs** (composition) | Session + voice controller + popout bridge + block filtering. |
| `useChatAppSession` | **Truly belongs** | Context consumer for session provider. |
| `useDesktopSettings` | **Truly belongs** | Electron IPC + web localStorage for app settings. Optional future `SettingsNexus`. |
| `useDeepLinks` | **Truly belongs** | Protocol URL → workspace navigation. |
| `useShellThemeSync` | **Truly belongs** | Applies CSS tokens on profile/flags change. |
| `chatAppModalUiState` | **Truly belongs** | Thin `uiStore` selector bundle. |
| `useRichComposer` | **Truly belongs** | Editor/composer UI state. |
| `useSubmenuController` | **Truly belongs** | Menu hover/focus behavior. |

---

## Mobile host glue (`apps/mobile`)

| Hook / provider | Verdict | Notes |
|-----------------|---------|-------|
| `MobileMainSessionContext` | **Split** | Communities/channels on nexuses. Provider owns channel errors, warm-entry prefetch, permission hydrate. **HavenCore.prepareCommunityEntry** could absorb warm path. |
| `MobileDirectMessagesContext` | **Existing nexus + thin provider** | `DirectMessageNexus` + local error/send state. Could inline into landing screens like web. |
| `MobileNotificationsContext` | **Existing nexus + thin provider** | `NotificationNexus` + sound sync + UI errors. |
| `MobileSocialWorkspaceContext` | **Truly belongs** | `uiStore` friends panel + `core.social.useCounts()`. |
| `useAuthSession` | **Truly belongs** | Mobile session reader. |
| `useMobileExpoPushRegistration` | **Truly belongs** | Native push token lifecycle. |
| `useMobilePushNotificationRouting` | **Truly belongs** | Expo notification tap → navigation store. |
| `useMobileVoipFoundation` | **Truly belongs** | CallKit/VoIP native integration. |
| `useHydrateMobileThemeFromProfile` | **Truly belongs** | RN theme from profile. |
| `useMobileThemeTokens` | **Truly belongs** | Theme token resolver. |
| `useMobileServerAdminActions` | **Existing nexus → core.admin** | Thin backend wrappers for mobile settings. Collapse into direct `core.admin` calls. |
| `useFriendsModalData` | **Split** | Reads `SocialNexus`; owns search UI state. **Search → SocialNexus.searchUsers()**; keep modal loading local. |
| `useProfileAvatarPicker` | **Truly belongs** | Image picker UI. |
| `useCurrentUserIdentity` | **Existing nexus → ProfileNexus** | Auth + profile compose → `core.profiles.useViewerProfile()` once platform session moves. |
| `useFloatingDmPlaceholderChannels` | **Truly belongs** | RN tab bar chrome config. |
| `useDmBubbleSheetChrome` | **Truly belongs** | Sheet layout chrome. |

---

## UI / debug hooks (keep)

| Hook | Verdict |
|------|---------|
| `useChatComposerColors`, `useChatComposerChrome`, `useChatSurfaceChrome`, `useChatSurfaceLayoutDebug` | **Truly belongs** — chat surface styling/layout |
| `useDataCacheComponentProbe`, `useDataCacheDebugRevision` | **Truly belongs** — debug only |
| `useSettingsContext` | **Truly belongs** — settings panel context |
| `PasswordRecoveryGateContext` | **Truly belongs** — mobile auth gate |

---

## Recommended new nexuses (optional)

| Candidate | Owns | Why not existing? |
|-----------|------|-------------------|
| **PlatformNexus** (or HavenCore session slice) | Feature flags, platform staff, viewer profile bootstrap metadata | No home today; `usePlatformSession` + `useFeatureFlags` duplicate bootstrap-fetch patterns |
| **SettingsNexus** (low priority) | App settings, notification audio, voice settings when unified across web/desktop | Split between Electron IPC, web localStorage, `useDesktopSettings` |

Do **not** create nexuses for: navigation interactions, deep links, push routing, WebRTC, theme CSS sync, composer chrome.

---

## Priority migration queue (next coding passes)

1. **`usePlatformSession` + `useFeatureFlags` → ProfileNexus / PlatformNexus** — bootstrap-owned; kills duplicate session fetches
2. **`useVoiceMemberVolumes` → VoiceNexus** — same pattern as community display order
3. **`useMobileServerAdminActions` → direct `core.admin`** — delete hook
4. **`useFriendsModalData` search → SocialNexus** — keep modal UI state local
5. **`useChatAppAccessAndBroadcastOrchestration` → HavenCore commands** — hook = register handlers only
6. **Shrink `useChatAppSessionState`** — inline business actions; elevation → permissions focus sync
7. **Mobile contexts → landing `useEffect`s** — same pattern as web DM/notifications migration
8. **`useVoice` split** — nexus owns session snapshot; hook owns media/effects only

---

## Summary counts

| Verdict | ~Count |
|---------|--------|
| **Truly belongs** | ~35 (auth, platform, WebRTC, UI chrome, debug, navigation glue) |
| **Existing nexus** | ~12 (profile, voice prefs, admin actions, social search, permissions elevation, mobile context thin layers) |
| **New nexus warranted** | 1–2 (`PlatformNexus` for flags/staff; optional `SettingsNexus`) |
| **Transitional / shrink** | 3 heavy (`useChatAppSessionState`, `useVoice`, mobile session contexts) |

---

## HavenCore orchestration added in this cleanup

| API | Role |
|-----|------|
| `prepareTextChannelMessages(communityId, channelId)` | Policy + revoked authors + message page load |
| `prepareDirectMessageConversation(conversationId, options?)` | DM thread load + optional mark-read |
| `refreshCommunities(userId)` | Reload community list + access-loss sync |
| `createCommunity(userId, name)` | Create + refresh |
| `syncActiveCommunityAccess()` | Notify when active community disappears |
| `setCommunityDisplayOrder(ids)` / `resetCommunityDisplayOrder()` | Sidebar order (host storage) |
| `prefetchCommunityChannelMessages({ serverId, channelId })` | Idempotent channel prefetch |
| `syncNotificationSounds` | In-app notification sound playback |

Nexus extensions: `CommunityMessageNexus` (sendWithMedia, ensureInitialLoaded, loading selectors), `DirectMessageNexus` (openConversation, compose draft), `NotificationNexus` (preferences, inbox mutations), `CommunityAdminNexus` (`core.admin`), `CommunityNexus` (display order, load error).
