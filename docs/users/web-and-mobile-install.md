# Haven Web & Mobile Install Guide

## What this is
Haven can run as a normal website and as an installable web app (PWA) on desktop and mobile.

This guide covers:
- installing Haven on desktop/mobile
- enabling notifications for this device
- basic troubleshooting

## Recommended browsers (current rollout)

- **Windows:** Chrome PWA (recommended)
- **iPhone/iPad:** Safari + Add to Home Screen

Known issue:
- Windows Edge PWA push notifications may be inconsistent (under investigation).

## Desktop Install (Chrome on Windows/macOS)

1. Open Haven in Chrome (`https://haven.redrixx.com` or your staging URL).
2. Sign in.
3. Use the install icon in the address bar (or `⋮ -> Cast, save, and share -> Install page as app`).
4. Open the installed Haven app window.

## iPhone / iPad Install

1. Open Haven in Safari.
2. Sign in (or sign in after install).
3. Tap **Share**.
4. Tap **Add to Home Screen**.
5. Open Haven from the Home Screen icon.

## Enable Notifications (This Device)

Haven uses browser/system notifications for background alerts.

1. Open Haven and sign in.
2. Open the Notification Center.
3. Use the notification enable action/CTA when prompted.
4. Approve the browser/system permission prompt.

If permission is granted, Haven will subscribe this device automatically.

## Expected Behavior

- **App focused/open:** Haven uses in-app notification behavior
- **App background/minimized/locked:** system push notifications are used (when supported/enabled)

## Quick Troubleshooting

### I don’t see install options
- Make sure you are on HTTPS (not `http://` except localhost during local dev)
- Reload the page once
- Confirm the site manifest loads and service worker is registered

### Notifications do not arrive
- Confirm browser/system notification permission is granted
- Reopen the installed app once after granting permission
- Disable/re-enable notifications for the device in Haven settings if available
- Ensure you are testing from the canonical environment URL (avoid mixing staging aliases)

### Windows Edge specific note
If push works in Chrome but not Edge on the same machine, you are likely seeing the known Edge/WNS issue. Chrome is the recommended Windows canary browser for now.
