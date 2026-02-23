# Backend Seam Refactor

## What Changed
- Added a backend resolver entrypoint at `src/lib/backend/index.ts`.
- Moved main renderer data flow to backend interfaces instead of direct Supabase calls.
- Updated server list hook to use the same control-plane interface.
- Kept existing behavior and permissions logic unchanged (current provider is still central Supabase).

## Current Seam Design

### 1) Control Plane Backend
File: `src/lib/backend/controlPlaneBackend.ts`

Responsibilities:
- Profile load/update
- Platform staff lookup
- User community list + membership subscription
- Community creation
- Invite create/list/redeem/revoke

Used by:
- `src/lib/hooks/useServers.ts`
- `src/renderer.tsx`

### 2) Community Data Backend
File: `src/lib/backend/communityDataBackend.ts`

Responsibilities:
- Community permissions lookup
- Channels list/create/update/delete + subscription
- Messages list/send + subscription
- Author profile/staff expansion
- Channel overwrite reads/writes
- Server settings reads/writes
- Haven developer message posting

Used by:
- `src/renderer.tsx`

### 3) Notification Backend
File: `src/lib/backend/notificationBackend.ts`

Responsibilities:
- Notification inbox list + unread/unseen counts
- Notification seen/read/dismiss state updates
- Global notification preference reads/writes
- Notification inbox realtime subscription

Used by:
- `src/renderer.tsx`

### 4) Backend Resolver
File: `src/lib/backend/index.ts`

Responsibilities:
- Selects backend mode (`HAVEN_BACKEND_MODE`)
- Returns `ControlPlaneBackend`, `CommunityDataBackend`, `NotificationBackend`, and `SocialBackend`
- Central place to route to future provider implementations

Current mode:
- `central_supabase` (default)

### 5) Social Backend
File: `src/lib/backend/socialBackend.ts`

Responsibilities:
- Friends/requests/blocked users reads
- Friend search (exact username v1)
- Friend request send/accept/decline/cancel
- Friend remove and block/unblock mutations
- Social graph realtime subscription (friend requests/friendships/blocks)

Used by:
- `src/components/FriendsModal.tsx`
- `src/renderer.tsx` (friends badge counts + notification friend-request actions)

### 6) Direct Message Backend
File: `src/lib/backend/directMessageBackend.ts`

Responsibilities:
- DM conversation list + create/load for 1:1 direct messages
- DM message list/send/read state updates
- DM thread mute/unmute preference writes
- DM message reporting (to Haven)
- DM workspace realtime subscriptions

Used by:
- `src/renderer.tsx` (DM workspace navigation + thread state)

### 7) Moderation Backend
File: `src/lib/backend/moderationBackend.ts`

Responsibilities:
- Haven staff DM report review inbox list + filtering
- DM report detail loading (reported message + metadata)
- DM report context retrieval (staff-scoped, not general DM member access)
- DM report assignment, status transitions, and audit-note actions
- DM report audit trail reads

Used by:
- `src/components/DmReportReviewPanel.tsx` (staff-only DM moderation review surface)

## Testing and Hardening Expectations (Phase 5)

Backend seams now have explicit regression expectations:
- SQL/RLS regression suites under `supabase/tests/sql/*`
- local-Supabase backend contract tests under `src/lib/backend/__tests__/*`

Current coverage focus:
- `NotificationBackend`
- `SocialBackend`
- `DirectMessageBackend`
- `ModerationBackend`
- targeted `CommunityDataBackend` mention-trigger integration coverage

Runbook:
- `docs/testing/rls-and-hardening-runbook.md`

## Why This Matters
- UI components no longer depend on Supabase query details.
- Future provider changes are isolated behind backend interfaces.
- You can swap transport/storage strategy incrementally without rewriting large React surfaces.

## Out of Scope in This Refactor
- `src/contexts/AuthContext.tsx` still uses central Supabase auth directly (intentional).
- `src/lib/voice/ice.ts` still uses central Supabase Edge Function routing (covered in Phase D below).

## Proposed Future Changes

### Phase A: Multi-Community Provider Routing
- Add a control-plane table that maps `community_id -> data_backend_target`.
- Extend `getCommunityDataBackend(communityId)` to resolve backend per community.
- Cache provider clients per community to avoid repeated setup.
- Initial schema scaffold now exists in:
  - `supabase/migrations/20260217_000007_add_community_backend_routing.sql`
  - table: `public.community_backend_configs` (default `central_supabase`)

### Phase B: BYO Community Data Credentials
- Add encrypted credential storage for owner-provided backend config.
- Decrypt credentials only in trusted runtime (not renderer) and mint short-lived tokens for client access.
- Never store owner raw secrets in local plaintext.

### Phase C: Provider Adapters
- Implement adapter(s) that satisfy `CommunityDataBackend`:
  - `supabaseCommunityDataBackend` (owner-provided project)
  - `restCommunityDataBackend` (generic REST service)
- Keep feature parity contract tests across adapters.

### Phase D: Voice Provider Separation
- Add a `VoiceIceBackend` seam similar to data/control plane.
- Route ICE config by community/provider policy.
- Keep existing `voice-ice` edge function as one adapter target.

### Phase E: Operational Hardening
- Add retry/backoff and standardized error mapping at backend layer.
- Add telemetry hooks per backend call for latency/failure tracking.
- Add health checks so invalid per-community configs can be surfaced in settings UI.

## Immediate Next Safe Steps
1. Add lightweight backend call tracing (dev-only) to verify no hidden direct Supabase calls creep back into UI code.
2. Introduce contract tests for `ControlPlaneBackend` and `CommunityDataBackend`.
3. Create a read-only server settings section for “Data backend target” so you can expose future routing state before enabling writes.
