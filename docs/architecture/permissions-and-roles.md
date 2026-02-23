# Permissions and Role Management

## Core Principle
The database is the enforcement agent. The app UI reads and writes permission state, but authorization decisions are enforced by Supabase RLS and SQL functions.

## What Enforces Access
- Server-level checks: `public.user_has_permission(community_id, permission_key)`
- Channel visibility: `public.can_view_channel(channel_id)`
- Channel posting/speaking gate: `public.can_send_in_channel(channel_id)`
- Table-level enforcement: RLS policies on `roles`, `role_permissions`, `member_roles`, `channels`, `messages`, and overwrite tables.
- Regression coverage: SQL RLS suites in `supabase/tests/sql/*`

## Current Server Admin Surface
`src/components/ServerSettingsModal.tsx` now has four tabs:
- `General`: server metadata + report/developer settings.
- `Roles`: create/edit/delete roles and assign server-wide permission keys.
- `Members`: assign roles to community members.
- `Invites`: create/revoke invite links.

## Data Flow (DB-First)
1. Renderer calls backend methods in `src/lib/backend/communityDataBackend.ts`.
2. Backend methods read/write these tables directly:
   - `roles`
   - `role_permissions`
   - `member_roles`
   - `community_members`
   - `permissions_catalog`
3. RLS decides whether each operation is allowed.
4. UI reloads latest state from DB after each mutation.

No permission decision is trusted from UI state alone.

## Tiered Model
Role tiers are represented by `roles.position` (higher number = higher tier in UI sorting).

Current behavior:
- Roles are displayed by descending `position`.
- Member role assignment and role permission edits are persisted to DB.
- Default role protection is applied in UI workflow by always retaining `@everyone` assignment.

## Strict Hierarchy Enforcement
Database policies now enforce hierarchy by position (not just UI):
- Non-owners can only create roles with `position` lower than their highest role.
- Non-owners can only edit/delete roles lower than their highest role.
- Non-owners can only assign/remove roles for members below their highest role.
- Non-owners can only edit channel role/member overwrites for targets below their highest role.

Implemented in:
- `supabase/migrations/20260218_000009_enforce_role_hierarchy_by_position.sql`

## Test Matrix (Phase 5)
Current SQL RLS coverage includes:
- non-member channel/message visibility denial
- member/default-role channel access
- overwrite-restricted channel visibility/send behavior
- moderator message moderation behavior
- permission helper checks (`user_has_permission`, channel helpers)

Runbook:
- `docs/testing/rls-and-hardening-runbook.md`

## Extension Rules
When adding new server capabilities:
1. Add a permission key in `permissions_catalog` and migrations.
2. Update role grants through `role_permissions`.
3. Surface capability in `fetchServerPermissions`.
4. Gate UI visibility with server permission flags.
5. Keep actual access control in DB/RLS.

## Files to Know
- `src/lib/backend/communityDataBackend.ts`
- `src/lib/backend/types.ts`
- `src/components/ServerSettingsModal.tsx`
- `src/renderer.tsx`
- `supabase/migrations/20260217_000001_reset_discord_like_schema.sql`
- `supabase/tests/sql/01_core_permissions_rls.sql`
