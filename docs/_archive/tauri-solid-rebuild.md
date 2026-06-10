# Tauri + Solid rebuild

Status: **exploratory spike** — runs in parallel to the live Electron + React app.
Branch: `feat/tauri-solid-rebuild` (cut from `staging`).

## Intention

Evaluate replacing the desktop stack:

- **Shell:** Electron (`apps/electron`) → **Tauri** (`apps/tauri`, Rust core + native webview)
- **UI:** React (`packages/web-client`) → **Solid** (`packages/solid-client`)

Nothing in the existing stack is modified. The Electron app keeps shipping. If we
abandon this direction, deleting `apps/tauri/` and `packages/solid-client/` removes
it with zero blast radius.

## Two independent migrations

| Axis  | From → To        | Scope                               | Difficulty           |
| ----- | ---------------- | ----------------------------------- | -------------------- |
| Shell | Electron → Tauri | `apps/electron` main/preload (thin) | Medium, mechanical   |
| UI    | React → Solid    | `packages/web-client` (~107 files)  | Large, the real work |

They ship independently. Most risk/effort is the Solid rewrite, not Tauri.

## What the current architecture gives us

- `packages/shared` is nearly framework-free — only ~7 files touch React (binding hooks
  like `useHavenCore`, `useVoice`, `AuthContext`). The nexus/features/infrastructure
  logic is pure TS and is reused by **both** stacks.
- The Electron main process is small: `electron`, node builtins, `update-electron-app`,
  `electron-squirrel-startup`, plus our own `@platform/ipc` keys/validators.

## Current spike scope (this commit series)

Prove out **shell + composition only** — no `@shared` wiring yet:

- `apps/tauri/` — Tauri v2 shell with a minimal `ping` command to demonstrate the
  `invoke` IPC convention.
- `packages/solid-client/` — placeholder Solid UI (signal-based composition, a chat-shell
  layout) that runs both in a plain browser (Vite) and inside Tauri.
- Backend access is **injected** into the Solid app (shell provides capabilities, UI
  consumes an interface) — foreshadowing how we'll line backend access up with the
  mobile platform-injection pattern later.

Deliberately **not** in scope yet: importing `@shared`, real auth, Supabase, LiveKit.

## Dependency mapping (React → Solid) — for the real port later

| React (current)            | Solid replacement                            | Notes                                        |
| -------------------------- | -------------------------------------------- | -------------------------------------------- |
| `react` / `react-dom`      | `solid-js`                                   | Core; components run once, signals not hooks |
| `radix-ui` / `@radix-ui/*` | `@kobalte/core`                              | Headless primitives; API differs             |
| `lucide-react`             | `lucide-solid`                               | Drop-in-ish                                  |
| `sonner`                   | `solid-sonner`                               | Toasts                                       |
| `react-virtuoso`           | `virtua` (Solid) / `@tanstack/solid-virtual` | **Verify chat scroll carefully**             |
| `@tiptap/react`            | `@tiptap/core` + manual Solid binding        | Tiptap core is framework-agnostic            |
| `react-markdown` + remark  | `solid-markdown` / render `marked` output    | We already use `marked`                      |
| `react-image-crop`         | no 1:1 port — wrap a vanilla lib             | **Gap to plan for**                          |
| `@use-gesture/react`       | `@use-gesture/vanilla` + Solid wrapper       | Core is framework-agnostic                   |
| `next-themes`              | Kobalte / custom; `themes` pkg is shared     | Low effort                                   |
| `cmdk`                     | `cmdk-solid` / build on Kobalte              | **Verify maintenance**                       |
| `zustand` (React bindings) | vanilla store + Solid `from()`               | Logic survives                               |

Highest-risk items to validate before committing: **LiveKit voice in a native webview**,
`react-image-crop` replacement, and `cmdk` coverage.

## Tauri-specific porting notes (for later)

- IPC: `preload.ts` + `ipcMain.handle` → `#[tauri::command]` + `invoke()`. Adapt at the
  existing `@platform/ipc` seam.
- Main-process logic: reimplement in Rust (fs/path/os/dialog/notification plugins) or keep
  Node as a Tauri **sidecar**.
- Auto-update: `update-electron-app` → `@tauri-apps/plugin-updater` (same GitHub releases flow).

## How to run the spike

```bash
# Solid UI in a plain browser (no Rust needed) — port 5174
npm run dev:solid

# Full Tauri shell (requires Rust toolchain: https://rustup.rs)
npm run tauri:dev
```
