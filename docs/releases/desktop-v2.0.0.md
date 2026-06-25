## Haven 2.0 — desktop & web, rebuilt

This is the big one. The desktop and web clients have been **rebuilt from the ground up** on a new foundation: a Tauri shell and a Solid UI, both running on the same framework-free core that powers the iOS app. The retired Electron desktop and React/Vite web clients (the `1.x` line) shipped, proved the product, and earned their retirement — `2.0` is the next generation.

A lighter shell, a faster renderer, and one shared core so a feature lands once and shows up everywhere.

### Highlights

- **New foundation** — Tauri desktop + Solid UI on the cleaved, framework-free shared core. Web ships as a static SPA from the same code.
- **Auto-update built in** — desktop updates itself from GitHub Releases. No app-store gatekeeping, no paid signing required for updates.
- **Full feature parity** with the clients it replaces — communities, text channels with markdown + media, voice, DMs, friends, profiles & themes.
- **Accounts on desktop & web** — sign up and reset your password right in the app.
- **Moderation, end to end** — community modmail inbox (live, across every community you moderate), report a message or user from a right-click menu, ban/kick/unban, and a full role editor.
- **Invites** — create, set expiry and max-uses, copy, and revoke.
- **Notifications** — an inbox with unread counts plus in-app toasts.
- **Custom window chrome, deep links, single-instance** — it feels like an app, not a browser window.

### Install

Download the installer for your platform below.

- **Windows** — `Haven_2.0.0_x64-setup.exe`
- **macOS** — `Haven_2.0.0_universal.dmg` (Apple Silicon + Intel)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

> **Heads up:** these builds aren't OS-code-signed yet, so the first launch shows a SmartScreen (Windows) or Gatekeeper (macOS — right-click → Open) prompt. That's expected. Update signing (the part that keeps auto-update trustworthy) is fully in place.

Once installed, Haven keeps itself up to date automatically.

### Known issues

- **Voice pop-out is temporarily disabled** on desktop while its cross-window sync is reworked — voice itself (join/leave, mute/deafen, presence, sounds) works normally. It returns in a follow-up `2.0.x`.
- **No rich-text composer yet.** The message box is a plain text area. Markdown you type still renders (bold, italic, code, lists, links, spoilers), but the formatting toolbar and keyboard shortcuts from the old desktop client are a `2.0.x` follow-up.

### Under the hood

Every release check is green: lint, types, unit/component tests, the SQL + RLS suite, and backend contract tests. Access control still lives in the database (Postgres RLS), not the UI.

Full story in the [dev log](https://projects.haven.redrixx.com/devlog).
