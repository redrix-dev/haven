# Context Menu Event Flow Map

This map documents the current menu surfaces and their trigger hierarchy after the stabilization refactor.

## Message Surface (`src/components/MessageList.tsx`)

- Trigger scope: `data-menu-scope="message"` on each message row container.
- Menu primitive: `ContextMenu`.
- Handler:
  - `onContextMenu` resolves intent via `resolveContextMenuIntent`.
  - `native_text` -> stop propagation so Electron native text menu wins.
  - `entity_profile` -> prevent row menu from opening.
- Overflow menu (`...`) uses `DropdownMenu` but shares the same action schema via `ActionMenuContent`.

## Profile Surface (`src/components/menus/ProfileActionSurface.tsx`)

- Trigger scope: `data-menu-scope="profile"` on the clickable wrapper.
- Menu primitive: `DropdownMenu` (single primitive for both left and right click).
- Handlers:
  - Left click opens profile actions (same menu).
  - Right click opens profile actions with `preventDefault + stopPropagation`.
  - `native_text` intent bypasses profile actions.

## Server Members Surface (`src/components/ServerMembersModal.tsx`)

- Each row is wrapped in `ProfileContextMenu` (re-export of `ProfileActionSurface`).
- Behavior is identical to profile surfaces in message rows.

## Channel Surface (`src/components/Sidebar.tsx`)

- Trigger scope: `data-menu-scope="channel"` on channel button rows and group headers.
- Menu primitive: `ContextMenu`.
- Handler:
  - `onContextMenuCapture` resolves intent.
  - `native_text` -> stop propagation.
- Action content rendered by `ActionMenuContent`.

## Server Surface (`src/components/ServerList.tsx`)

- Trigger scope: `data-menu-scope="server"` on server icon buttons.
- Menu primitive: `ContextMenu`.
- Handler:
  - `onContextMenuCapture` resolves intent.
  - `native_text` -> stop propagation.
- Action content rendered by `ActionMenuContent`.

## Native Text Context (`src/main.js`)

- Source: `webContents.on('context-menu')`.
- Editable target menu: `Cut`, `Copy`, `Paste`, `Select All`.
- Selected non-editable text menu: `Copy`, `Select All`.
- Debug hook (dev opt-in): `HAVEN_DEBUG_CONTEXT_MENUS=1`.

## Shared Infrastructure

- Intent resolver: `src/lib/contextMenu.ts`.
- Debug tracing + prompt trap: `src/lib/contextMenu/debugTrace.ts`.
- Shared action types: `src/lib/contextMenu/types.ts`.
- Shared action renderer + submenu behavior:
  - `src/components/menus/ActionMenuContent.tsx`
  - `src/components/menus/useSubmenuController.ts`
