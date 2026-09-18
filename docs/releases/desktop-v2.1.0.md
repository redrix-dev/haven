## Haven 2.1.0

A feature release on top of 2.0.2. Links and sign-in emails now work the same way on every device, the message composer gets a formatting toolbar, community owners get full management tools on desktop, and voice on Linux no longer depends on the system webview.

### Links that open where you are

- **One kind of link for everything** — invites, communities, channels, DMs, and notifications all use `https://haven.redrixx.com/…` links that work in any app you paste them into. Invite links copied from desktop now work everywhere; previously they could point at a local address.
- **Signed out? The link waits.** Open an invite while signed out and Haven remembers it; after you sign in or finish signing up, it opens the invite — pre-filled, never joined automatically. Remembered links expire after 7 days.
- **Links open in the app first.** Open a Haven link in a browser on your computer and it offers to open the desktop app, signed in or not — tick "Always allow" in the browser's prompt to skip the question next time, or continue in the browser instead.
- **Links Haven can't open say so**, instead of showing a blank screen.

### Sign-up and password emails

- **Email links no longer sign you in just by being opened.** They land on a Haven page with a button, so an email security scanner that pre-fetches links can't use them up before you click.
- **Open a link on a different device and it still works.** A link requested from the desktop app offers **Open Haven** when you open it in a browser, or you can continue in the browser instead.
- **Password reset by email works on desktop.** Previously the desktop app couldn't complete sign-in from these links.
- **Already signed in?** Haven asks before continuing with a link that might switch accounts — it never switches silently.
- **Expired or already-used links** now explain what happened straight away.
- The emails themselves are redesigned, with proper light and dark mode support.

### Messages

- **Formatting toolbar** in community channels and DMs — bold, italic, underline, strikethrough, inline code, code blocks, quotes, links, and spoilers, each with a Cmd/Ctrl keyboard shortcut.
- Links pasted into the composer behave correctly, and new messages no longer land out of order.
- Fixed a direct-message view that could get stuck reloading and flicker.

### Communities

- **Community settings on desktop** — edit your community's overview, manage channels, and organize them into **channel groups**.
- **Channel permissions** — set per-channel permission overrides from the channel settings.
- **Profiles** — edit your profile in settings, and see member profile cards from the members panel.
- **Notification settings** — a dedicated screen for choosing what notifies you.
- Opening a community you've left, or a channel that was deleted, now takes you somewhere sensible instead of an empty channel with a composer that can't send.

### Voice

- **Native voice on Linux** — voice now runs through a bundled native audio component on Linux, with echo cancellation, device selection, and volume control, instead of relying on the system webview's WebRTC support.
- Voice presence in the sidebar stays in a stable order, and speaking indicators update correctly.

### Install

Download the installer for your platform below.

- **Windows** — `Haven_2.1.0_x64-setup.exe`
- **macOS** — `Haven_2.1.0_universal.dmg` (Apple Silicon + Intel)
- **Linux** — `.AppImage`, `.deb`, or `.rpm`

Existing installs on 2.0.x will update automatically.

### Known issues

- **Voice pop-out is still hidden on desktop.** It needs its cross-window sync moved onto the desktop app's own event system; voice itself — join, leave, mute, deafen, presence — works normally.
- **Windows shows a SmartScreen prompt on first install.** The Windows installer isn't Authenticode-signed yet. Update signing, which keeps auto-update trustworthy, is fully in place.
