# Renderer/Main Boundary Rules

## Hard Rules
1. Feature code must never import `@/shared/ipc/*`.
2. Renderer code must never import `@/app/main/*`, `electron`, or `node:*`.
3. Desktop access in renderer must go through `@/shared/desktop/client`.
4. `window.desktop` must only be used in `src/shared/desktop/client.ts`.
5. IPC keys stay centralized in `src/shared/ipc/keys.js` and are not duplicated inline.

## Desktop Contract Flow
1. `src/shared/desktop/types.ts` defines the canonical desktop API contract.
2. `src/preload/index.js` is the thin preload entrypoint and delegates desktop bridge exposure to `src/preload/desktop-bridge.js`.
3. `src/shared/desktop/client.ts` is the only renderer-side access point.

## Notification / Moderation Boundary Notes

### Notification production boundary
- Notification rows are created server-side (SQL RPCs and DB triggers).
- Renderer never inserts notification rows directly.

### Notification deep-link boundary
- Renderer maps notification payloads to UI routes.
- DB/RLS remains the authority when routed data is loaded.
- Invalid payloads must fail closed in renderer (no implicit fallback data reads).

### Renderer entry loading boundary
- BrowserWindows must load renderer entrypoints through the main-process renderer entry service (loopback HTTP parity path).
- Do not load Forge `MAIN_*_WEBPACK_ENTRY` constants directly from `BrowserWindow.loadURL(...)`.
- Renderer entry transport (proxy/static) is a local content transport only, not a privileged API surface.
- Renderer-document CSP injection must target only the renderer entry service origin/path, not third-party iframe responses.

### DM moderation boundary
- Reporter-side DM report creation is user-scoped (`report_dm_message(...)`).
- Haven staff review uses dedicated moderation RPCs + `ModerationBackend`.
- Staff DM context access is intentionally scoped to moderation RPCs, not general DM-member RLS.

## Extending Desktop Capabilities
1. Add/update types in `src/shared/desktop/types.ts`.
2. Add preload implementation.
3. Add or update client methods in `src/shared/desktop/client.ts`.
4. Consume that method from feature/service code.

## PR Checklist
- [ ] No direct `window.desktop` usage outside `src/shared/desktop/client.ts`.
- [ ] No `@/shared/ipc/*` imports from renderer/feature code.
- [ ] No renderer imports from `@/app/main/*`, `electron`, or `node:*`.
- [ ] IPC key strings only come from `src/shared/ipc/keys.js`.
- [ ] New notification producers are server-side (RPC/trigger), not renderer-side row inserts.
- [ ] Notification deep-link routes do not assume access; routed views still rely on DB authorization.
- [ ] DM moderation review UI uses moderation RPCs/backend seam (not raw DM table reads).
- [ ] BrowserWindows load renderer entry via renderer entry service (no direct `MAIN_*_WEBPACK_ENTRY` loads).
