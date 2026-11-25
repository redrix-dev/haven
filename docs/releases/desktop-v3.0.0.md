## Haven 3.0.0

A new major version. Haven now runs on a rebuilt database, so this release starts everyone fresh: accounts from 2.x do not carry over, and you sign up again. On top of it, reporting is rebuilt so every report reaches the right people and nobody is left wondering what happened, community messages can be edited and deleted, attachments no longer expire, and voice gets a proper call drawer with sounds, sensitivity and moderator controls.

### A fresh start on a new database

- **Everyone signs up again** — the 2.x accounts, communities and messages are not carried over. Your 2.x app updates itself to 3.0.0; then create a new account.
- **The database decides who may do what** — every permission is checked by the database itself, the same way for desktop, web and mobile, so no app can show you something you are not allowed to see.
- **Haven staff use separate staff accounts** — staff work happens from an account that does nothing else and needs an authenticator app to sign in. Staff members' own accounts carry a staff badge and no extra powers.

### Accounts and sign-up

- **A taken username is refused at sign-up** — the form tells you the name is in use, instead of quietly giving you a different one.
- **Suspensions and bans say why** — if Haven staff act on your account, you are told what was done, under which rule and why, in the app and by email.

### Reporting

- **You choose who a report goes to** — report a message to the community's moderators when it breaks the community's rules, or to Haven staff when it is illegal or dangerous. Reports about a profile go to Haven staff.
- **Reports keep what was said** — a report records the message and the conversation around it at the moment you file it, so deleting the message no longer erases the report.
- **You hear back** — you are told when Haven staff receive your report and what came of it. **Your reports**, in Settings, shows every report you have made and where it stands.
- **Moderators work reports in one place** — modmail shows each report's status and notes, and sends a report on to Haven staff in one step. Moderators never see reports about themselves.

### Messages

- **Edit and delete community messages** — from the message menu (right-click, long-press or the "…" button). Edit in place: Enter saves, Shift+Enter adds a line, Escape cancels. Delete asks first. The community's owner and moderators can delete messages too.
- **Attachments no longer expire** — files used to disappear after 30 days in communities and 24 hours in direct messages. Now they stay until their message, its sender's account or its community is deleted.

### Voice

- **A call drawer** — a compact control bar that opens into the list of who is in the call, with rings that light up as people speak, and a full call view.
- **Audio settings** — choose your input and output devices, voice activation or push-to-talk, and set the voice activation threshold against a live meter of your microphone.
- **Voice sounds** — short cues when people join or leave and when you mute, unmute, deafen or undeafen, with their own volume. On by default at half volume.
- **Participant controls** — set someone's volume or mute them just for you. Moderators can remove someone from voice, mute or deafen them (and undo it), or kick or ban them; the person is told who did it.
- **Speaking rings respond faster** — they follow the audio itself instead of waiting for the server.

### Install

Download the installer for your platform below.

- **Windows** — `Haven_3.0.0_x64-setup.exe`
- **macOS** — `Haven_3.0.0_universal.dmg` (Apple Silicon + Intel)

Existing installs on 2.x update automatically. After the update, create a new account.

Linux builds remain paused; see `docs/architecture/NATIVE_VOICE.md`.

### Known issues

- **Push-to-talk works only while Haven is the focused window.**
- **Voice pop-out is still hidden on desktop.** It needs its cross-window sync moved onto the desktop app's own event system; voice itself works normally.
- **Windows shows a SmartScreen prompt on first install.** The Windows installer isn't Authenticode-signed yet. Update signing, which keeps auto-update trustworthy, is fully in place.
