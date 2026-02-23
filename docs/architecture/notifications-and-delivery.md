# Notifications and Delivery Architecture

## Purpose
Describe how Haven notifications are created, stored, delivered in-app, marked seen/read, and extended by future producers.

## Current Design

### Inbox Model
- `public.notification_events`
  - immutable notification event record (`kind`, `source_kind`, `source_id`, `actor_user_id`, `payload`)
- `public.notification_recipients`
  - per-user inbox row + delivery flags + seen/read/dismiss state

### Semantics
- `seen_at`: user opened notification center and item was visible
- `read_at`: user acted on/opened the notification target
- `dismissed_at`: hidden from the active inbox list

### Current Producers
- Social graph RPCs:
  - `send_friend_request(...)`
  - `accept_friend_request(...)` (accepted notification)
- DM RPC:
  - `send_dm_message(...)`
- Channel mentions:
  - DB trigger `trg_messages_process_channel_mentions`
  - function `public.process_channel_message_mentions()`

### Current Delivery Resolution
- Global preferences only (`public.user_notification_preferences`)
- Mention notifications currently use global mention preferences only
- Server/channel overrides are intentionally backlogged (Phase 4)

### Sound Boundary
- Server/DB decides eligibility (`deliver_in_app`, `deliver_sound`)
- Renderer applies local desktop sound settings:
  - `masterSoundEnabled`
  - volume
  - play-when-focused behavior

## Trust Boundary
- Notification creation is server-side (SQL RPCs and DB trigger)
- Renderer never authoritatively creates notification rows
- Privacy is enforced by RLS on `notification_events` and `notification_recipients`
- Deep-link routing happens in renderer, but target access is still enforced by DB/RLS when data loads

## Sequence Flow: Channel Mention -> Inbox Delivery
1. User inserts channel message into `public.messages`
2. `trg_messages_process_channel_mentions` runs
3. `public.process_channel_message_mentions()` parses `@handles`
4. Mention targets are filtered by:
   - self-mention suppression
   - block relationship suppression
   - community membership
5. Delivery flags resolved via `resolve_channel_mention_notification_delivery_for_user(...)`
6. `notification_events` row inserted (`kind='channel_mention'`)
7. `notification_recipients` rows inserted for recipients
8. Renderer realtime subscription sees recipient-row insert and refreshes inbox/counts

## Failure Modes
- Invalid/missing deep-link payload fields -> notification opens fail safely in renderer
- Mention parser false negatives for usernames outside handle-style syntax (known v1 limitation)
- Realtime reconnect duplicates -> renderer refresh logic must stay idempotent
- Notification volume growth -> retention maintenance needed (`dismiss_old_read_notifications_before`)

## Extension Path
- Phase 4: add `community_notification_preferences` + `channel_notification_preferences`
- Native OS desktop notifications (deferred)
- Batching/coalescing for high-volume events
- New producers (system events, moderation alerts, etc.) emitting into the same inbox model

## Files to Know
- `supabase/migrations/20260222_000031_add_notification_foundation.sql`
- `supabase/migrations/20260222_000035_add_channel_mention_notifications_phase3.sql`
- `supabase/migrations/20260222_000036_phase5_hardening_and_test_support.sql`
- `src/lib/backend/notificationBackend.ts`
- `src/lib/notifications/sound.ts`
- `src/components/NotificationCenterModal.tsx`
- `src/renderer.tsx`

## Deferred / Future
- Server/channel notification preference overrides (Phase 4, backlogged during hardening pass)
- Native OS notifications
- Notification batching/coalescing

