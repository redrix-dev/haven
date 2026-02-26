# Haven Update: Web/PWA Notifications & Reliability Pass (Draft)

Haven now works much better as a real web app, not just a desktop app with a browser fallback.

This update focuses on **installable PWA support**, **background push notifications**, and a cleaner notification delivery path that is easier to trust and easier to validate.

## Highlights

- Installable Haven web app (PWA) for desktop and mobile
- Near-instant web push delivery path (with cron backstop for reliability)
- Better notification routing:
  - focused app => in-app behavior
  - background/minimized => system push notifications
- Improved notification correctness and cleanup (including friend request lifecycle handling)
- Stronger testability and release validation tooling (`test:signoff`)

## What’s New

### Installable PWA Experience
Haven now supports an installable PWA experience on supported browsers/platforms.

This means:
- desktop app-like windows from the web client
- mobile Home Screen installs
- background-capable notification delivery via service workers and web push

### Background Push Notifications (Web/PWA)
Haven now supports push notifications for background/minimized/locked app scenarios using web push + service workers.

Validated rollout targets:
- iOS installed web app (Home Screen)
- Windows Chrome PWA

### Near-Instant Delivery Path (With Reliability Backstop)
Notification delivery now supports an immediate wakeup path for much faster push sends, while cron remains enabled as a backstop for retries and recovery.

This improves responsiveness without removing recovery paths.

### Notification Center Upgrades
The Notification Center remains the main inbox for Haven notifications and has been improved as the primary user-facing notification hub.

## Reliability / Trust Improvements

- Push subscription lifecycle hardening (same-device dedupe via installation identity)
- Delivery tracing and queue health diagnostics (internal/dev/ops)
- Repeatable script-based validation + release signoff artifact

## Validation Confidence (Release Process)

Release candidates can now generate a signed validation artifact via:

```bash
npm run test:signoff -- --release-label <label> --environment <env> --test-author "<name>" --run-by "<name>"
```

This produces:
- command-by-command results
- timestamps
- git metadata
- `Test Author` / `Run By` signature fields

## Known Issue (Tracked)

### Windows Edge PWA Push Notifications
Windows Edge PWA push delivery may be inconsistent (WNS-specific behavior under investigation).

Current rollout recommendation:
- **Windows:** Chrome PWA
- **iOS:** Installed web app (Safari / Add to Home Screen)

## Rollout Guidance (Draft)

1. Canary on Windows Chrome PWA + iOS
2. Keep cron backstop enabled
3. Monitor queue health + retry/dead-letter trends
4. Track Edge/WNS separately without blocking Chrome+iOS rollout

---

This draft is intended to be finalized with the release signoff artifact and final staging/canary validation notes.
