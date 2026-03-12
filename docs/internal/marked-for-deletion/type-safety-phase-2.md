# Type Safety Phase 2: `unknown` Error Boundaries

Date: February 18, 2026

## Goal
Replace catch-style `any` with `unknown`, while preserving concrete types where shapes are known.

Phase 2 builds on Phase 1 (`docs/architecture/type-safety-phase-1.md`) and focuses on error boundaries only.

## Decision Rule
- Use concrete types when shape is known and stable (e.g., Supabase row mappers, interface contracts).
- Use `unknown` at unsafe boundaries (primarily `catch` and promise rejection callbacks).
- Narrow `unknown` before reading fields.

This avoids silent runtime assumptions while still keeping strong typing where deterministic contracts exist.

## Shared Utility Added
File: `packages/shared/src/platform/lib/errors.ts`

- Added `getErrorMessage(error: unknown, fallback?: string): string`.
- Handles:
  - `Error` instances
  - plain string throws
  - object throws with `message`
  - default fallback for everything else

Why:
- Centralizes unknown-to-string normalization.
- Removes repeated ad-hoc message extraction logic.

## Files Updated

### Core
- `packages/shared/src/platform/lib/errors.ts`
- `src/renderer.tsx`
- `packages/shared/src/contexts/AuthContext.tsx`
- `packages/shared/src/lib/hooks/useServers.ts`
- `packages/shared/src/lib/voice/ice.ts`

### UI Components
- `packages/shared/src/components/AccountSettingsModal.tsx`
- `packages/shared/src/components/ChannelSettingsModal.tsx`
- `packages/shared/src/components/CreateChannelModal.tsx`
- `packages/shared/src/components/JoinServerModal.tsx`
- `packages/shared/src/components/LoginScreen.tsx`
- `packages/shared/src/components/MessageInput.tsx`
- `packages/shared/src/components/MessageList.tsx`
- `packages/shared/src/components/ServerSettingsModal.tsx`
- `packages/shared/src/components/VoiceChannelPane.tsx`

## Validation
- `npm run lint` passed.
- `npx tsc --noEmit` passed.

## Metrics

Pattern counted:
- `:\s*any\b` and `Promise<any>` (excluding `node_modules`, build outputs, coverage)

Before Phase 2:
- 27 occurrences (all catch-style)

After Phase 2:
- 0 occurrences

Interpretation:
- Catch/error boundaries now use `unknown`.
- No explicit `any` remains in `src/` or `services/supabase/` under this pattern set.

## Notes
- This pass intentionally avoided changing runtime control flow.
- The migration is typing-focused and should be behavior-preserving.
