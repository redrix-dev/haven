# Solid client build — hand-off snapshot (2026-06-12)

State of the desktop/web rebuild as of the voice slice, plus the open platform
questions and the constraints that must survive any change of direction. The
living plan remains [SOLID_REBUILD.md](./SOLID_REBUILD.md); the shape law is
[architecture/SOLID_CLIENT_SHAPE.md](./architecture/SOLID_CLIENT_SHAPE.md).
This document is the "stop and think" snapshot — read it before resuming.

All work is on `rewrite/desktop-web-rebuild`, verified by `test:cleave`
(lint + boundaries, shared-portable, all typechecks, mobile bundle, unit
tests) and live browser/Tauri testing.

---

## What exists and works

**Milestone 1 — shell + community text chat (2026-06-11):**

- Routes: `/sign-in`, auth-guarded `/` →
  `/community/:communityId[/channel/:channelId]`, `/direct-messages[/conversationId]`,
  `/friends`, `/settings/appearance`, `/popout/voice`. URL is the source of
  truth — `CommunityRouteSync` writes cache active-ids from params, never the
  reverse.
- `components/ui/`: Kobalte-based Button/TextField/Avatar/Tooltip + the
  `Markdown/` chat renderer (marked lexer → Solid token renderer; `||spoiler||`
  as an inline tokenizer extension mirroring the shared parity contract; html
  tokens render inert, hrefs protocol-filtered — no innerHTML anywhere, no
  sanitizer needed).
- Community chat: virtua-virtualized list behind a view-model seam (the list
  receives plain view models, no data access — a canvas renderer can swap in
  without touching wiring), author grouping + date dividers + reply context,
  live-profile overlay (same shared helpers as mobile), plain-textarea
  composer (`normalizeCommunityMarkdown` before send), `loadOlder` pagination
  with virtua `shift`, realtime inserts via the already-routed core.
- Members panel (fleshed `CommunityAdminSolidCache`), viewer-profile support
  in `ProfileSolidCache` (also seeds the live-profiles map — that's what
  resolves the optimistic send's "…" placeholder).
- Theme lifecycle (`contexts/ThemeProvider.tsx`): localStorage at boot →
  viewer-profile theme wins → optimistic select with revert, persisted via
  `profiles.updateViewerProfile` so mobile follows. Applying a theme writes
  primitive **and resolved semantic** CSS vars, and persists a **boot palette**
  that `index.html` reads pre-paint (no theme flash between loads).
- Typography: Geist / Geist Mono (fontsource variable fonts), wired through
  Tailwind `--font-sans` / `--font-mono` in the app-owned `theme.css`.

**Voice slice + first popout (2026-06-12):**

- `VoiceSolidCache` = 1:1 port of mobile's VoiceNexus (session state machine,
  voice-token fetch, Supabase presence/kick channels, sidebar presence subs).
- `contexts/VoiceProvider.tsx` owns the LiveKit Room (join/leave/mute/deafen,
  participants with speaking indicators, kick handling, device switching, web
  audio-element management, autoplay-blocked recovery). Sign-out force-leaves
  voice. Sidebar voice rows join on click and show live occupants; `VoiceDock`
  renders under the sidebar.
- Popout: `/popout/voice` + `bridge.openPopout` (Tauri `WebviewWindow` with
  window-creation capabilities; browser `window.open` fallback). Cross-window
  model: **owning window is the source of truth; popout is a mirror + remote
  control over BroadcastChannel; it never opens a second LiveKit connection.**
- **Shell weight is a route decision**: providers wrap route branches, not the
  App root. Main branch = full stack; `/popout` branch = `PopoutLiteShell`
  (localStorage theme only — no session boot, no second realtime
  subscription). The multi-popout seam: a future data-backed popout (channel
  watcher window) adds its own session-equipped shell + child route under
  `/popout` — never special window code.

**Backend change shipped:** migration
`20260612000000_include_author_in_message_insert_broadcast.sql` (applied) —
the MESSAGE_INSERT fanout now includes the author's own private channel, so
the same user's other devices get realtime messages (clients dedupe by id).

## Stack picks (all adopted, in the tree)

| Need                | Pick                                | Note                                    |
| ------------------- | ----------------------------------- | --------------------------------------- |
| Headless primitives | `@kobalte/core`                     | styled by us with semantic tokens       |
| Icons               | `lucide-solid`                      |                                         |
| Virtualized chat    | `virtua/solid`                      | `shift` for prepend; seam allows swap   |
| Markdown            | `marked` lexer + own Solid renderer | parity contract honored at source level |
| Voice               | `livekit-client`                    | same cloud + token function as mobile   |
| Fonts               | `@fontsource-variable/geist(-mono)` |                                         |

## Hard constraints — survive any direction change

1. **One webview window = one JS heap.** True in Tauri, Electron, and
   browsers. Cross-window state is always message passing underneath. Even
   Discord's popout doesn't share state across contexts — it renders the main
   window's React tree into a brainless `window.open` child (Electron-only
   trick), and its audio never hitches because audio lives in a native
   process, not in any window. We already hold the equivalent property: the
   LiveKit room never moves during popout.
2. **BroadcastChannel payloads must be plain objects.** Solid store proxies
   fail structured clone (`DataCloneError`) — and when the postMessage runs in
   a `createEffect`, the exception unwinds out of the _store write that
   triggered the flush_. Symptom: code directly after a `setStore` silently
   never runs. This burned a half-day; it's documented in
   `contexts/voiceSync.ts`.
3. **The Tailwind theme bridge emits utilities for SEMANTIC tokens only.**
   `bg-surface-2` / `text-text-primary` generate nothing, silently. Use
   `bg-card`, `text-foreground`, `bg-surface-panel`, etc. Theme application
   must write `resolveSemanticEntries()` too, not just `theme.tokens`.
4. **`packages/shared` is TypeScript.** The cleave's payoff — one pure
   contract layer consumed by every client — survives any _web-technology_
   client and dies in a Dart/Kotlin/C# rewrite (hand parity or codegen).
   Price any re-platforming proposal with this line item.
5. **Solid's `render()` appends into its container** — anything pre-rendered
   in `#root` (the boot splash) must be removed explicitly (`main.tsx`).
6. **The hello/mirror protocol assumes one owner.** Only a joined/joining
   VoiceProvider answers `hello`; idle tabs stay silent (an idle reply would
   clobber the owner's). Mind this if more mirrored surfaces appear.
7. **Same-account multi-device voice is untested.** LiveKit identity = userId
   on every device; LiveKit's default disconnects the older connection with
   the same identity (Discord-style takeover). Test deliberately and decide if
   that's the intended UX before voice ships; affects whether identity needs a
   device suffix.
8. **`uiSessionStore.subscribe` is a no-op** — it cannot back
   `createStoreSelector`. Fix before the first cross-feature modal needs it.
9. **No realtime reconnect hardening.** `CHANNEL_ERROR` only warns; a dead
   socket stays dead until reload (observed once in dev). Slate alongside the
   next realtime-heavy slice.
10. **`tauri:build` smoke test still pending** and now load-bearing twice:
    deep-path reload under the custom protocol AND the popout window loading
    `/popout/voice` in production. Dev mode dodges both via the Vite server.
    Must happen before any packaged build ships.

## The open platform question

Raised 2026-06-12 after comparing popout feel against Discord. The standard
being chased: native-feeling windows, no audio hitches, no web-jank texture.

**Current assessment:** the single-instance-runtime promise of Solid+Tauri
holds per window; multi-window isolation is webview physics, not a Tauri
defect; today's measurable gap is **webview spawn latency** on window creation
(~100–300 ms WebView2 spin-up) plus general webview texture concerns. The
sync "tangle" today is ~60 lines for one surface.

**Experiments queued to answer it cheaply (run before any re-platform talk):**

1. **Warm window pool (Tauri)** — create the popout window hidden when voice
   connects, lite shell pre-loaded, `show()`/`hide()` instead of
   create/destroy. Popout becomes a visibility toggle → the Discord
   half-frame feel. ~half day.
2. **Portal popouts (web shell)** — the literal Discord technique:
   same-origin `window.open` child + Solid `<Portal>` into its document,
   stylesheets adopted. One heap, no sync protocol, no boot. Web-only (wry
   has no shared-renderer children). ~half day.
3. Judge both against Discord by hand. If the texture still misses the bar,
   the serious alternatives are **Compose Multiplatform** (closest to the
   "one process, N windows, one state" mental model) or **Flutter desktop**
   (first-party LiveKit + Supabase SDKs) — both full rewrites that orphan the
   TS shared layer (constraint #4). Avalonia/Qt/Rust-native exist but trade
   away web's best-in-class rich-text rendering, which a chat app feels daily.

**The deciding question:** how multi-window is Haven's future? Voice popout +
an occasional channel watcher → mirror + warm pool covers it forever.
Tear-everything-into-windows (trading-terminal style) → the webview tax
compounds per window and the native conversation becomes real.

**Experiment implementation note (2026-06-13):** both cheap experiments now
exist behind shell capabilities for comparison. Tauri advertises
`preparePopout` and warms the existing route-based `/popout/voice` window
hidden, then `openPopout` shows/focuses that same WebView so the native path
still uses the BroadcastChannel mirror contract. The plain browser shell
advertises `browserPortalPopout` and opens an `about:blank` same-origin child
window, prepares a document shell, copies styles/theme attributes, and mounts
the shared voice panel into it with Solid `<Portal>`. The browser child-window
lifecycle is covered by `packages/solid-client/src/features/voice/__tests__/`
so blank-shell and stale-close regressions have a low-level guardrail; still
judge the feel by hand against Discord in a real joined voice session.

## Known cosmetic/UX debt (not blockers)

- Loading skeletons: white screens are fixed (dark boot splash, themed via
  boot palette), but real skeletons/witty rotating boot lines are unbuilt.
- Voice: PTT / voice-activity gating, per-member volumes, device picker UI,
  kick UI, STAFF badge on own optimistic sends.
- Bundle is ~1.07 MB (livekit-client). First code-split: lazy-load the voice
  path.
- Friends/social surface now exists on `/friends` with friends, add, requests,
  and blocked tabs. Remaining social polish: block-from-profile/context flows
  once those profile/message menus exist.
- Message actions (edit/delete/reactions; DM report is implemented) — cache
  methods still need porting where mobile supports them.
- Cache persistence to disk (`rehydrate()` is a no-op) + per-channel scroll
  memory — deliberate later phase.

## Next slices (order standing from SOLID_REBUILD.md)

1. Notifications (+ `solid-sonner`).
2. Direct messages edit/delete/reaction actions + floating bubble flavor.
3. Tiptap composer.
4. Shell capabilities as needed (`appHost.ts` → Tauri invoke via bridge).

## How to run / verify

```bash
npm run dev:solid      # browser, port 5174 (no Rust needed)
npm run tauri:dev      # full Tauri shell
npm run typecheck:solid && npm run build:solid   # fast gate
npm run test:cleave    # full gate — run before commit
```

Mobile install drift note: if `mobile:typecheck` fails on a missing module,
`npm run setup:mobile` (npm ci) clears it — happened twice this week.
