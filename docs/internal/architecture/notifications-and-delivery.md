# Notifications and Delivery Architecture

## Purpose
Describe how Haven notifications are created, stored, delivered (foreground and background), and debugged.

## Core Model

### Inbox records (DB source of truth)
- `public.notification_events`
  - immutable event payload (`kind`, source ids, actor, payload)
- `public.notification_recipients`
  - per-user delivery row (`deliver_in_app`, `deliver_sound`, read/seen/dismiss state)

### Delivery split (current)
- `Supabase Realtime`:
  - foreground/in-app inbox refreshes and counts
- Retained backend web-push stack:
  - currently not wired into the active browser client

Realtime is the active notification transport used by the current browser and Electron clients.

## Delivery Stages

1. Producer creates a notification event + recipient rows (server-side SQL)
2. Recipient rows drive:
   - in-app inbox visibility
   - sound eligibility
   - push queue fanout eligibility
3. Web push jobs may still be queued for retained backend compatibility
4. Renderer opens deep links and marks notifications read/dismissed as appropriate

## Producers (Current)
- Friend requests / social graph RPCs
- Direct messages (`send_dm_message(...)`)
- Channel mentions (`process_channel_message_mentions()`)

## Notification Preferences
- In-app and sound prefs remain per kind (friend request / DM / mention)
- Push prefs are separate (do not overload `deliver_sound`)
- DM mute logic is respected at creation and rechecked at send-time for push races

## Push Infrastructure (Supabase)

### Subscription registry
- `public.web_push_subscriptions`
- Stores:
  - endpoint
  - encryption keys (`p256dh_key`, `auth_key`)
  - client/device metadata
  - `installation_id` for same-device dedupe/replacement

### Push queue
- `public.web_push_notification_jobs`
- One job per `(notification_recipient, subscription)`
- Status lifecycle:
  - `pending`
  - `processing`
  - `done`
  - `skipped`
  - `retryable_failed`
  - `dead_letter`

### Worker
- `services/supabase/functions/web-push-worker/index.ts`
- Supports:
  - `cron`
  - `manual`
  - `shadow`
  - `wakeup`
- Cron remains a backstop
- Immediate wakeups are the near-realtime path

## Near-Realtime Delivery (Wakeup + Cron Backstop)

- Notification queue fanout triggers a debounced immediate wakeup request
- Worker processes fresh jobs quickly (`wakeup` mode)
- Cron sweep remains enabled for:
  - missed wakeups
  - retries
  - backstop recovery

This is the current production-target design.

## Active Client Delivery

The active clients use:

- in-app inbox updates via realtime
- local sound playback gated by notification preferences and local audio settings

Files:
- `packages/shared/src/client/features/notifications/hooks/useNotifications.ts`
- `packages/shared/src/components/NotificationCenterModal.tsx`

## Delivery Traces and Diagnostics (Internal/Dev)

### DB traces
- `public.notification_delivery_traces`
- Used for:
  - delivery decisions
  - wake source parity checks
  - skip/send reason diagnostics

### Queue health diagnostics
- Queue health RPCs expose backlog age, retry pressure, stale leases, dead-letter trends
- Used for shadow/cutover readiness and rollback decisions

### Dev tooling policy
- Diagnostics and test tools exist for internal/dev use
- They should be hidden behind an explicit dev flag in production UX

## Trust / Security Boundaries

- Notification rows are server-authored (SQL RPCs/triggers)
- Renderer cannot authoritatively create inbox rows
- RLS protects notification visibility
- Service-role operations are isolated to Edge Functions / backend contexts
- Browser clients only use publishable keys and user JWTs

## Known Platform Variances

- The retained backend web-push stack includes historical platform-specific behavior and diagnostics.
- Current active validation targets are Electron desktop and the desktop browser client.

## Files to Know

- `packages/shared/src/lib/backend/notificationBackend.ts`
- `packages/shared/src/client/features/notifications/hooks/useNotifications.ts`
- `packages/shared/src/client/features/notifications/hooks/useNotificationInteractions.ts`
- `packages/shared/src/components/NotificationCenterModal.tsx`
- `services/supabase/functions/web-push-worker/index.ts`
- `services/supabase/migrations/20260225000041_add_list_my_sound_notifications_rpc.sql`
- `services/supabase/migrations/20260226000056_add_web_push_queue_health_diagnostics_rpc.sql`

