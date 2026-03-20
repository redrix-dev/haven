# Haven Web Access Guide

## What this is
Haven can run directly in the browser on desktop.

This guide covers:
- opening Haven in the browser
- expected notification behavior while the app is open
- basic troubleshooting

## Recommended browsers

- **Windows/macOS/Linux:** Chrome or Edge
- **Electron desktop:** preferred when you want the packaged desktop client

## Open Haven In The Browser

1. Open Haven in Chrome or Edge (`https://haven.redrixx.com` or your staging URL).
2. Sign in.
3. Keep the tab open while using Haven.

## Expected Behavior

- **App focused/open:** Haven uses in-app notification behavior.
- **Sound playback:** local sound settings apply on the current device.

## Quick Troubleshooting

### The page does not load correctly
- Confirm you are using the expected HTTPS URL.
- Reload the page once after a deploy.
- Make sure you are not mixing staging and production URLs in the same browser session.

### Notifications do not appear in the app
- Open the Notification Center and confirm the relevant in-app and sound preferences are enabled.
- Keep the Haven tab open while testing browser usage.
