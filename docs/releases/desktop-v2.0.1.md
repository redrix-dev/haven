## Haven 2.0.1 — patch

Patch release on top of 2.0.0. Fixes a boot hang on the packaged desktop client, ships macOS code signing and notarization, and enables voice channels on macOS.

### Fixes

- **Boot hang on first launch** — the packaged app could hang indefinitely on the splash screen instead of starting. Fixed. Boot failures now also surface a legible error message instead of silently hanging.
- **macOS code signing + notarization** — the macOS build is now signed with a Developer ID and notarized by Apple. The Gatekeeper "unidentified developer" prompt on first launch is gone.
- **Voice channels on macOS** — `navigator.mediaDevices` was unavailable in the packaged build due to missing microphone entitlements. The audio-input entitlement is now declared; macOS will prompt for microphone permission on first voice join.

### Install

Download the installer for your platform below.

- **Windows** — `Haven_2.0.1_x64-setup.exe`
- **macOS** — `Haven_2.0.1_universal.dmg` (Apple Silicon + Intel)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

Existing installs on 2.0.0 will update automatically.

### Known issues

- **Voice pop-out is temporarily disabled** on desktop while its cross-window sync is reworked — voice itself (join/leave, mute/deafen, presence, sounds) works normally. It returns in a follow-up `2.0.x`.
- **No rich-text composer yet.** The message box is a plain text area. Markdown you type still renders (bold, italic, code, lists, links, spoilers), but the formatting toolbar and keyboard shortcuts are a `2.0.x` follow-up.
