# Notifications and Delivery Architecture

## Purpose
Describe how Haven notifications are created, stored, delivered (foreground and background), and debugged.

## Core Model

### Inbox records (DB source of truth)
- `public.notification_events`
  - immutable event payload (`kind`, source ids, actor, payload)
- `public.notification_recipients`
  - per-user delivery row (`deliver_in_app`, `deliver_sound`, read/seen/dismiss state)

### Delivery split (intentional)
- `Supabase Realtime`:
  - foreground/in-app inbox refreshes and counts
- `Web Push + Service Worker`:
  - background/minimized/lock-screen OS notifications

Realtime is **not** treated as the background delivery transport because browsers/PWAs suspend.

## Delivery Stages

1. Producer creates a notification event + recipient rows (server-side SQL)
2. Recipient rows drive:
   - in-app inbox visibility
   - sound eligibility
   - push queue fanout eligibility
3. Web push jobs are queued per recipient x subscription
4. `web-push-worker` claims jobs and sends push
5. Service worker shows notification (or suppresses based on route policy)
6. Renderer opens deep links and marks notifications read/dismissed as appropriate

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
- `supabase/functions/web-push-worker/index.ts`
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

## Client Route Arbiter (Foreground vs Background)

Haven uses a route policy to prevent duplicate user-facing alerts:

- Focused app:
  - in-app notification path
  - suppress OS push display
- Background/minimized app with active push:
  - OS push display
  - suppress Haven in-app sound
- No push support / permission:
  - in-app fallback

Files:
- `src/lib/notifications/routePolicy.ts`
- `src/renderer/features/notifications/hooks/useNotifications.ts`
- `src/web/public/haven-sw.js`

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

- Windows Edge PWA push (WNS endpoints) may fail to deliver/receive even when provider accepts sends
- Chrome (Windows) and iOS installed web app are the primary canary validation targets
- Edge/WNS is tracked as a known issue, not a blocker for Chrome+iOS canary rollouts

## Files to Know

- `src/lib/backend/notificationBackend.ts`
- `src/renderer/features/notifications/hooks/useNotifications.ts`
- `src/renderer/features/notifications/hooks/useNotificationInteractions.ts`
- `src/lib/notifications/routePolicy.ts`
- `src/web/pwa/webPushClient.ts`
- `src/web/public/haven-sw.js`
- `supabase/functions/web-push-worker/index.ts`
- `supabase/migrations/20260225000041_add_list_my_sound_notifications_rpc.sql`
- `supabase/migrations/20260226000056_add_web_push_queue_health_diagnostics_rpc.sql`

