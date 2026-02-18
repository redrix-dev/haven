# Type Safety Phase 1: Structural `any` Removal

Date: February 18, 2026

## Goal
Remove structural `any` usage from stable interfaces and data-mapping boundaries, without changing runtime behavior.

Phase 1 intentionally does **not** touch broad `catch (error: any)` usage. That is Phase 2.

## Scope
In scope:
- Public interface return types.
- Props/function signatures.
- Database mapper inputs and relation row shapes.
- WebRTC diagnostics row parsing where dynamic stats fields are read.

Out of scope:
- `catch (err: any)` and `.catch((err: any) => ...)` blocks.
- Broader error normalization and shared result/error utility work.

## Changes Implemented

### 1) Auth context contract typing
File: `src/contexts/AuthContext.tsx`

- Replaced:
  - `Promise<{ error: any }>` for `signUp` and `signIn`.
- With:
  - `signUp`: `Promise<{ error: AuthError | PostgrestError | null }>`
  - `signIn`: `Promise<{ error: AuthError | null }>`

Why:
- `signUp` can return an auth error or a profile insert (`PostgrestError`).
- Contract now matches actual runtime branches and prevents unsafe downstream assumptions.

### 2) Create server modal callback typing
File: `src/components/CreateServerModal.tsx`

- Replaced:
  - `onCreate: (name: string) => Promise<any>`
- With:
  - `onCreate: (name: string) => Promise<{ id: string }>`

Why:
- The call site returns a known shape (`{ id: string }`).
- Removes ambiguous return typing from a stable component boundary.

### 3) Community backend member mapping typing
File: `src/lib/backend/communityDataBackend.ts`

- Added typed relation row alias for `community_members` + joined `profiles`.
- Replaced:
  - `.map((member: any) => ...)`
- With:
  - `.map((member: CommunityMemberWithProfile) => ...)`

Why:
- This is a central permission/member mapping path.
- Explicit row shape prevents accidental unsafe field access.

### 4) Control-plane invite/community mapping typing
File: `src/lib/backend/controlPlaneBackend.ts`

- Added:
  - `InviteRecord` for invite mapper input.
  - `CommunityMemberCommunityRow` for `community_members` relation projection.
- Replaced:
  - `mapInvite(invite: any)`
  - `.map((item: any) => item.communities)`
- With typed versions.

Why:
- These mappers are used in core server list/invite flows.
- Strong typing guards backend contract drift.

### 5) Voice diagnostics stats typing
File: `src/components/VoiceChannelPane.tsx`

- Added:
  - `RTCStatsRecord = RTCStats & Record<string, unknown>`
- Replaced:
  - `new Map<string, any>()`
  - `stats.forEach((report: any) => ...)`
- With typed stats records and explicit guards (`typeof ... === ...`).

Why:
- Preserves flexibility for browser-specific stats fields while removing `any`.
- Keeps diagnostics logic safe and explicit.

## Validation
- `npm run lint` passed.
- `npx tsc --noEmit` passed.

## Metrics

Using the repo audit command:

Pattern counted:
- `:\s*any\b` and `Promise<any>` (excluding `node_modules`, build artifacts)

Before Phase 1:
- 34 occurrences total
- 7 structural occurrences (non-catch)
- 27 catch-style occurrences

After Phase 1:
- 27 occurrences total
- 0 structural occurrences
- 27 catch-style occurrences

Interpretation:
- Phase 1 removed all targeted structural `any` usage.
- Remaining `any` usage is entirely in catch handling and is Phase 2 work.

## Phase 2 Backlog (Next)
Status: Completed. See `docs/architecture/type-safety-phase-2.md`.

1. Replace `catch (err: any)` with `unknown`.
2. Add shared `getErrorMessage(error: unknown): string` helper.
3. Normalize error shapes in UI/service layers.
4. Optionally enforce via lint rule (`@typescript-eslint/no-explicit-any`) with controlled allowlist for migration.
