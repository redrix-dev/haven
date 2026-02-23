# Direct Messaging Architecture

## Purpose
Document Haven's current 1:1 direct messaging system (friends-only), including authorization, notification coupling, and extension points.

## Current Design

### Core Tables
- `public.dm_conversations`
- `public.dm_conversation_members`
- `public.dm_messages`
- `public.dm_conversation_notification_preferences`
- `public.dm_message_reports`

### Authorization Helpers
- `public.is_dm_conversation_member(...)`
- `public.can_send_dm_in_conversation(...)`
- `public.are_friends(...)`
- `public.is_blocked_either_direction(...)`

### Key RPCs
- `get_or_create_direct_dm_conversation(...)`
- `list_my_dm_conversations()`
- `list_dm_messages(...)`
- `send_dm_message(...)`
- `mark_dm_conversation_read(...)`
- `set_dm_conversation_muted(...)`
- `report_dm_message(...)`

### Product Rules (current)
- DMs are friends-only
- Existing DM conversations can remain visible, but sends are blocked if friendship no longer allows messaging
- Per-thread mute overrides global DM notification defaults

### Renderer Model (current)
- `workspaceMode: 'community' | 'dm'`
- DM list + thread state in `src/renderer.tsx`
- UI components:
  - `DirectMessagesSidebar`
  - `DirectMessageArea`

## Trust Boundary
- Membership and send permissions are enforced in DB helpers + RLS/RPCs
- Renderer UI state is convenience only
- DM notifications are emitted server-side by `send_dm_message(...)`
- DM report creation is user-facing; DM report review is staff-only and separate

## Sequence Flow: DM Send + Notification
1. User opens/creates direct conversation via `get_or_create_direct_dm_conversation(...)`
2. User sends message via `send_dm_message(...)`
3. RPC checks:
   - membership
   - block state
   - friends-only gating
   - rate limit (hardening pass)
4. Message row inserted into `dm_messages`
5. Conversation metadata updated (`last_message_at`)
6. Sender `last_read_at` updated
7. Recipient notification delivery resolved (global DM prefs + per-thread mute override)
8. `dm_message` notification emitted (if allowed)
9. Realtime updates refresh DM list/thread/inbox UI

## Failure Modes
- Friendship removed/block added between open and send -> send fails with DB error
- Realtime duplicates/out-of-order events -> renderer must refresh idempotently
- Per-thread mute confusion -> conversation summary + header need clear muted state
- Shared singleton client in tests -> backend contract tests must run sequentially

## Extension Path
- Group DMs (schema-ready via `dm_conversations.kind='group'`)
- Message edit/delete RPCs
- Attachments/media
- Reactions/replies
- Message jump anchors from DM notifications

## Files to Know
- `supabase/migrations/20260222_000033_add_direct_messages_phase2.sql`
- `supabase/migrations/20260222_000036_phase5_hardening_and_test_support.sql`
- `src/lib/backend/directMessageBackend.ts`
- `src/components/DirectMessagesSidebar.tsx`
- `src/components/DirectMessageArea.tsx`
- `src/components/DmReportModal.tsx`
- `src/renderer.tsx`

## Deferred / Future
- Group DMs
- Attachments/reactions/replies in DMs
- Native OS DM notifications

