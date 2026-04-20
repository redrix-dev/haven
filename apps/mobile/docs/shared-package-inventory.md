# `packages/shared` mobile inventory

**Authoritative boundary rules:** [`docs/PORTABLE_SHARED.md`](../../../docs/PORTABLE_SHARED.md) (composition root, portable uploads, store rules). This file is a **granular** audit and may lag refactors.

This classifies **runtime importability from React Native** (Metro), not “could we rewrite it.” DOM-heavy `app/ui` primitives now live under `packages/web-client/src/app-ui` (legacy `@shared/app/ui/*` path aliases); feature `components/` are still treated as **web UI** unless noted.

Legend:

- **Mobile-ready** — No DOM, no web-only libraries in the import graph for the described entry; usable from RN once any **process/env** wiring you need is satisfied.
- **Needs adapter** — Good logic to keep centralized, but today depends on `window`/`document`/`localStorage`, `process.env` shape, `AppHost` defaults, Electron preload, or similar; RN should call through a small platform layer or refactored seams.
- **Needs RN rewrite** — Primarily web components or APIs; mobile should reimplement UI (e.g. NativeWind) and optionally call **mobile-ready** / **adapter-wrapped** logic underneath.

---

## Mobile-ready (reuse as-is or with env only)


| Area                                                                                                                                                                                                     | Notes                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types/database.ts`                                                                                                                                                                                      | Generated types; no platform deps.                                                                                                                                 |
| Most `lib/backend/*.ts` **logic**                                                                                                                                                                        | RPC/data shapes are portable once `initializeHavenDataFromClient` ran (no import-time env singleton).                                                            |
| `lib/backend/types.ts`, interfaces                                                                                                                                                                       | Pure TypeScript.                                                                                                                                                   |
| `lib/backend/index.ts`                                                                                                                                                                                   | Mode resolution uses `process.env`; fine once Metro defines `HAVEN_BACKEND_MODE` or you hardcode for mobile.                                                       |
| `lib/voice/ice.ts` (and similar fetch-only helpers)                                                                                                                                                      | Verify no `window` in subtree; safe if HTTP-only.                                                                                                                  |
| `platform/lib/errors.ts`, `platform/lib/logger.ts`                                                                                                                                                       | Generally safe; confirm no DOM in each file before importing.                                                                                                      |
| `stores/authStore.ts`                                                                                                                                                                                    | Zustand + Supabase **types** only.                                                                                                                                 |
| `stores/navigationStore.ts`, `serversStore.ts`, `dmStore.ts`, `messagesStore.ts`, `notificationsStore.ts`, `socialStore.ts`, `uiStore.ts`, `voiceStore.ts`, `liveProfilesStore.ts`, `userStatusStore.ts` | Zustand-only **if** you do not pull in modules that import web-only code from store actions/selectors (audit per usage).                                           |
| `platform/appHost.ts`                                                                                                                                                                                    | Types + `getAppHost` / `setAppHost` are fine; **default host implementation** uses `window.open` — mobile must `setAppHost` at startup before calling URL helpers. |


---

## Needs mobile adapter (keep logic, add indirection)


| Module / pattern                                                                            | Issue                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`@shared/lib/supabase`~~ (removed)                                                        | Replaced by `createHavenSupabaseClient` + `initializeHavenDataFromClient` at host startup; CI blocks reintroduction (`npm run check:shared-portable`).                                                                 |
| `@shared/lib/deepLinks.ts`                                                                  | Uses `window.location.origin` when present. **Adapter:** pass `origin` / base URL from `expo-constants` or config.                                                                                                                                                                                                         |
| `@shared/lib/notifications/devTrace.ts`                                                     | `localStorage`. **Adapter:** `AsyncStorage`, no-op, or dev-only file sink.                                                                                                                                                                                                                                                 |
| `@shared/features/community/hooks/useServerOrder.ts`                                        | `localStorage`. **Adapter:** `AsyncStorage` with same key scheme or shared `createServerOrderStorage(backend)` factory.                                                                                                                                                                                                    |
| `@shared/app/hooks/useDesktopSettings.ts`                                                   | `localStorage` for web audio/voice prefs. **Adapter:** AsyncStorage or native settings.                                                                                                                                                                                                                                    |
| `@shared/features/direct-messages/components/DirectMessagesSidebar.tsx` (width persistence) | `localStorage` in component. **Adapter:** extract persistence interface.                                                                                                                                                                                                                                                   |
| `@shared/app/components/Sidebar.tsx`                                                        | Same for sidebar width.                                                                                                                                                                                                                                                                                                    |
| `@shared/features/voice/hooks/useVoiceMemberVolumes.ts`                                     | `localStorage`. **Adapter:** AsyncStorage.                                                                                                                                                                                                                                                                                 |
| `@shared/contexts/AuthContext.tsx`                                                          | Uses `window.location` / `history` for OAuth-style flows and redirects. **Adapter:** `expo-linking` / WebBrowser auth session; keep session listener logic.                                                                                                                                                                |
| `@shared/app/hooks/useDeepLinks.ts`                                                         | `window.location`, `history`. **Adapter:** Linking API + mobile navigation store.                                                                                                                                                                                                                                          |
| `@shared/app/AppRoot.tsx`                                                                   | `URLSearchParams(window.location.search)`. **Adapter:** not used on mobile; mobile entry reads Linking.                                                                                                                                                                                                                    |
| `@shared/platform/urls.ts`                                                                  | `window.location.origin`. **Adapter:** inject base URL.                                                                                                                                                                                                                                                                    |
| `sonner` / `toast` usage in **hooks**                                                       | If you extract orchestration hooks that only call `toast`, **adapter:** `setToastBridge` or pass `notify` from RN (`Burnt`, custom).                                                                                                                                                                                       |
| `@shared/stores/permissionsStore.ts`                                                        | Cache-only for elevation; callers pass `getCommunityDataBackend(id)` into `ensureElevatedInServer` (no backend import inside the store).                                                                                                                                                                                  |
| `@shared/lib/notifications/sound.ts`                                                        | `document.hasFocus()`. **Adapter:** `AppState` from `react-native`.                                                                                                                                                                                                                                                        |
| `@shared/lib/contextMenu.ts`                                                                | `window.getSelection`. **Adapter:** not applicable on RN; no-op or different selection model.                                                                                                                                                                                                                              |
| Clipboard usage in modals                                                                   | `navigator.clipboard`. **Adapter:** `expo-clipboard`.                                                                                                                                                                                                                                                                      |
| Timers using `window.setTimeout`                                                            | Works in Hermes as `global` but for purity use `setTimeout` without `window`. Low priority.                                                                                                                                                                                                                                |


---

## Needs RN rewrite (web UI / web runtime; do not import into RN)


| Area                                                  | Examples                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web-client/src/app-ui/*` (legacy `@shared/app/ui/*`) | Radix / shadcn primitives, `cmdk`, `lucide-react`, DOM.                                                                                                                                  |
| `app/components/*`, `app/chat-app/*` (screens/shells) | Layout, Electron assumptions, web hooks.                                                                                                                                                 |
| `features/**/components/`**                           | Same.                                                                                                                                                                                    |
| `features/messaging/components/richComposer.tsx`      | TipTap / ProseMirror web stack.                                                                                                                                                          |
| `app/ui/MarkdownText.tsx`                             | `react-markdown` web-oriented.                                                                                                                                                           |
| `features/voice/`** (many files)                      | `window.AudioContext`, keyboard listeners on `window`, WebRTC browser patterns — **RN needs** `react-native-webrtc` (or similar) and new hooks; only **non-DOM** helpers might transfer. |
| `platform/desktop/`*                                  | Electron-only.                                                                                                                                                                           |
| `lib/radixInteractionState.ts`                        | `document.querySelector`, Radix-specific.                                                                                                                                                |
| `lib/contextMenu/debugTrace.ts`                       | Dev-only DOM traps.                                                                                                                                                                      |


---

## Orchestration hooks (`app/chat-app/controllers`, `app/hooks`, feature hooks)

Treat as **case-by-case**:

- Many **only** need **toast** + **navigation store** + **backend** → become **mobile-ready** after **supabase** + **toast** + **navigation** adapters.
- Any file that imports **components** or **Radix** is **rewrite** for UI, but logic may be **extracted** into a `*.logic.ts` module in shared (recommended long-term).

---

## Mobile app scaffolding (this repo)

- `lib/registerMobileAppHost.ts` — calls `setAppHost` with `expo-linking` for `openExternalUrl` (replaces `window.open` defaults). Expand for downloads / desktop bridges as needed.
- `@shared/lib/createHavenSupabaseClient` + `initializeHavenDataFromClient` — used by `apps/mobile/src/supabase/getMobileSupabase.ts` with AsyncStorage; web/electron entry modules call the same bootstrap before rendering shared trees.
- `@shared/lib/listUserCommunitiesWithClient` — shared query used by mobile home grid and by `controlPlaneBackend.listUserCommunities`.

## Suggested import boundaries for phase 0 (login + community grid)

1. **Supabase client** created in `apps/mobile` (env from `app.config` `extra` or `EXPO_PUBLIC_`*), then either:
  - gradually refactor shared to `createSupabaseClient(config)`, or
  - temporarily duplicate minimal auth calls in mobile (avoid long-term drift).
2. `**setAppHost`** early in `App.tsx` with `Linking.openURL`, file save no-ops or `expo-sharing`, `isDesktopApp: () => false`.
3. **Auth:** either adapt `AuthContext` or implement a slim `useMobileAuth` that uses the same Supabase project rules; merge with `authStore` when stable.
4. **Community list:** reuse **backend** `getControlPlaneBackend` / community APIs **after** supabase adapter — do not import `CreateServerModal.tsx` etc.

---

## Maintenance

Re-run ripgrep when shared changes materially:

```bash
rg "window\\.|document\\.|localStorage|react-dom|@tiptap|radix-ui|lucide-react|sonner|react-virtuoso" packages/shared/src
```

Update this doc when modules move between buckets.