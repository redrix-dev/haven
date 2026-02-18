# Renderer/Main Boundary Rules

## Hard Rules
1. Feature code must never import `@/shared/ipc/*`.
2. Renderer code must never import `@/app/main/*`, `electron`, or `node:*`.
3. Desktop access in renderer must go through `@/shared/desktop/client`.
4. `window.desktop` must only be used in `src/shared/desktop/client.ts`.
5. IPC keys stay centralized in `src/shared/ipc/keys.js` and are not duplicated inline.

## Desktop Contract Flow
1. `src/shared/desktop/types.ts` defines the canonical desktop API contract.
2. `src/preload.js` exposes the implementation to the renderer.
3. `src/shared/desktop/client.ts` is the only renderer-side access point.

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
