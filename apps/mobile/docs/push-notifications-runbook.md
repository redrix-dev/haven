# Mobile Push Notifications Runbook

This runbook covers the Expo + Supabase push setup used by Haven mobile.

## Build commands (repo root)

- Dev client (needs Metro): `npm run mobile:eas:build:dev:ios`
- Preview standalone (no Metro): `npm run mobile:eas:build:preview:ios`
- Production standalone (no Metro): `npm run mobile:eas:build:prod:ios`

Android variants are available with `:android` suffix.

## Credential and secret setup

1. EAS credentials (FCM/APNs): `npm run mobile:eas:credentials`
2. Expo access token: create in Expo account settings.
3. Supabase Edge Function secrets for `expo-push-worker`:
   - `EXPO_ACCESS_TOKEN` (or `HAVEN_EXPO_ACCESS_TOKEN`)
   - `HAVEN_WORKER_CRON_SECRET`
4. Ensure `background_worker_cron_config` has:
   - `enabled = true`
   - valid `edge_base_url`
   - `cron_shared_secret` matching `HAVEN_WORKER_CRON_SECRET`
5. Re-run scheduler wiring:
   - `select public.configure_haven_background_cron_jobs();`

## Expected runtime flow

1. User signs in on mobile.
2. App requests notification permission and upserts token to `expo_push_subscriptions`.
3. Notification creation inserts into `notification_recipients`.
4. Trigger fan-out enqueues `expo_push_notification_jobs`.
5. `expo-push-worker` claims jobs and sends to Expo Push API.
6. Jobs move to `done` / `retryable_failed` / `dead_letter`.
7. Decisions are logged to `notification_delivery_traces` with `transport = 'expo_push'`.

## Common failure modes

- `UNAUTHORIZED_NO_AUTH_HEADER`: function deployed with JWT verification on, or wrong invocation path.
- Jobs stuck `pending`: cron is not invoking function, function not deployed, or auth gate failing.
- Worker running but no delivery: missing/invalid Expo access token, invalid device token, or APNs/FCM credential issues.
- Notification appears without vibration/haptic on iOS: device-level behavior; payload cannot force Android-style vibration patterns.

## Quick diagnostics

Use `tooling/scripts/sql/mobile-push-diagnostics.sql` as a copy-paste SQL bundle.
