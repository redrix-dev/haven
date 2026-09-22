# Links and auth emails — one model, one pipeline

Every link Haven understands — an invite, a notification tap, a password-reset
email — goes through the same two pieces: one parser that turns any incoming
string into an **intent**, and one pipeline that decides what to do with that
intent. Platforms differ only in how the string arrives and how navigation
happens.

Before this (up to 2.0.2) there were six parsers, two pending-invite stores and
three URL builders spread across shared, desktop and mobile. Consolidating them
in 2.1.0 is what fixed the bugs listed at the bottom.

## The two rules

1. **Every link a person sees is `https://haven.redrixx.com/…`.** The custom
   scheme `haven://` is internal transport between a browser and an installed
   desktop app — never something we put in an email, a share sheet or a page.
2. **A link is an intent, not a route.** Parsing yields a typed destination;
   only then does a platform navigate. Nothing acts on a raw URL string.

## The link model

`packages/shared/src/features/links/havenLinks.ts`

`parseHavenLink(input, { appOrigins })` accepts, and never throws:

- `https://haven.redrixx.com/…`, plus any origins the caller passes (Vercel
  previews, local dev)
- `haven://…`, in any casing or slash count
- app-relative push payloads (`/?kind=…`, from `expo-push-worker`)
- a bare 10-character invite code, so a pasted code works
- the legacy marketing-domain auth URL

Anything else — other hosts, `http:` on the app host, userinfo tricks, broken
percent-encoding — parses to `unsupported`, which the UI reports rather than
showing a blank screen.

The result is a `HavenLinkIntent`: `home`, `invite`, `community`, `channel`,
`dm`, `friends` (with tab and request id), `notifications`, `auth_confirm`
(with client and params), or `unsupported`. It's organised by **destination**,
not by what produced it, so a notification and a shared URL that mean the same
thing parse to the same intent.

`buildHavenLink`, `buildHavenLinkPath` and `buildHavenSchemeLink` go the other
way. Every buildable intent round-trips back through the parser in tests.

> **Parsing is string handling, deliberately — not `new URL()`.** Custom schemes
> parse differently across Node, Chromium, WebKit and Hermes, and React Native
> has no URL polyfill. Keep it that way.

## The pipeline

`packages/shared/src/core/linkPipeline.ts` — in `core`, not `features`, because
shared features may not import persistence.

`receive(input, "initial" | "event")` parses, drops duplicates, waits until the
session is known, then emits one action:

| Action                         | Meaning                                         |
| ------------------------------ | ----------------------------------------------- |
| `open`                         | go to the destination                           |
| `deferred`                     | signed out: remembered, will open after sign-in |
| `confirm_auth`                 | an auth link this client should act on          |
| `confirm_auth_while_signed_in` | ask before switching accounts — never silent    |
| `unsupported`                  | say so                                          |

There is deliberately **no join action**. An invite opens the pre-filled invite
screen; joining stays a human click.

What it guarantees:

- **A remembered link survives sign-in, sign-up and app restarts.** Stored raw
  under `NEXUS_STORAGE_KEYS.pendingLink` and re-parsed when it drains, so an
  updated app applies current rules. Latest wins, removed before it runs (at
  most once), expires after 7 days (`PENDING_LINK_TTL_MS`).
- **One click means one action.** A repeated `event` within 5 seconds
  (`LINK_DEDUPE_WINDOW_MS`) is one click; an `initial` link runs once per
  process, because `getCurrent()` / `getInitialURL()` keep replaying it.
- **Actions queue until a handler attaches**, covering the mobile cold-start
  race where a link arrives before the navigator exists.

Platforms supply only ports: delivery, storage, navigation, and a clock.

## Auth emails

Supabase is on the **implicit** flow. Email templates live in
`supabase/templates/` as the version-controlled original; the dashboard copy is
pasted from there.

Every template links to **our own page** with a `token_hash`, never
`{{ .ConfirmationURL }}`:

```
{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}/auth/confirm/web{{ end }}?token_hash={{ .TokenHash }}&type=<type>
```

This matters for two reasons: a link scanner that pre-fetches the URL can't
spend the token, because only a button press verifies it; and a link opened on
the wrong device can be handed to the right one.

`/auth/confirm/:client` names who asked — `web`, `desktop` or `ios`. The page
makes one pure decision (`packages/solid-client/src/features/auth/authConfirmPlan.ts`):

- Supabase's `error_description` wins over everything, shown immediately.
- `desktop` / `ios` → **Open Haven** (scheme link, params intact), plus
  **Continue in browser**.
- `web` with a `token_hash` → a **Confirm** button.
- `access_token` / `code` on web → wait; Supabase's `detectSessionInUrl` owns
  those.
- Inside the desktop shell → wait; the pipeline already exchanged the link.

Which client a request names comes from the **shell**, never from the page
address: `packages/shared/src/features/auth/domain/authConfirmRedirect.ts`, fed
by whether the desktop bridge exists. On Windows the Tauri webview's origin is
`http://tauri.localhost`, which looks exactly like a web origin — deciding from
it sent desktop users a `web` link on an address Supabase doesn't allow, and
Supabase then **silently** fell back to the Site URL root, which ignores the
token and drops the person on sign-in.

> **Any `redirectTo` that isn't allow-listed falls back to the Site URL with no
> error.** When an auth link "does nothing", check the allow-list first, and
> check what the client actually sent (the Supabase edge logs show
> `/auth/v1/recover?redirect_to=…`).

The confirm screen leaves only once a session exists. The recovery gate is
raised _before_ the token exchange so the app never flashes past the
new-password screen, but leaving on that alone reached the app layout with no
session and bounced to sign-in, stranding a live recovery session there.

## Delivery, per platform

| Platform | App closed                                                       | App running                             |
| -------- | ---------------------------------------------------------------- | --------------------------------------- |
| Windows  | argv → plugin `getCurrent()` (the URL must be the only argument) | single-instance → `deep-link-url` event |
| Linux    | same as Windows                                                  | same as Windows                         |
| macOS    | `RunEvent::Opened` → `getCurrent()`                              | `onOpenUrl`                             |
| iOS      | `Linking.getInitialURL()`                                        | `Linking.addEventListener("url")`       |
| Web      | page load                                                        | —                                       |

On iOS use `addEventListener`, not `useURL()`: its value doesn't change when the
same link is tapped twice.

**In a desktop browser**, a Haven destination link is offered to the installed
app first: `features/links/OpenInAppHandOff.tsx` shows "Opening Haven…" and asks
the browser once to open the scheme link, and the web pipeline only sees the
link if the person chooses **Continue in browser**. Phones skip it (iOS
Universal Links already open the app), and auth links skip it because
`/auth/confirm/:client` decides for itself. A page can't detect whether the app
is installed, or what the person chose in the browser's prompt, so the buttons
always stay.

**iOS Universal Links:** `apps/web/public/.well-known/apple-app-site-association`
(app ID `9H229274JB.com.redrix.haven.mobile`) plus `associatedDomains` in
`apps/mobile/app.json`. Vercel serves real files before rewrites, and
`vercel.json` sets its `Content-Type`, since the file has no extension.

## Traps

- **Whichever Haven binary launched last owns `haven://` on Windows and Linux**
  (`register_all()` uses `current_exe()`). Running `tauri dev` steals the scheme
  from the installed app. Before testing links, launch the installed build once
  and check the owner:
  - Windows — `(Get-ItemProperty 'HKCU:\Software\Classes\haven\shell\open\command').'(default)'`
  - macOS — only an installed `.app` registers; `tauri dev` can't
  - Linux — `xdg-mime query default x-scheme-handler/haven`
- **`getCurrent()` never clears**, so a cold-start link can be delivered twice
  or replayed later. That's what the pipeline's `initial` dedupe is for.
- **A stale `ios/` folder hides entitlement drift.** A plain `expo prebuild`
  reused an old folder and wrote `associated-domains` into a second, leftover
  entitlements file that only the Release configuration used — a dev build would
  have signed fine with no Universal Links. `expo prebuild --clean` collapses it
  back to one file. `ios/` is gitignored, so review can't catch this.
- **Read the cache before believing a probe.** An AASA check first returned
  `index.html` with a six-day-old `Age`, which looked exactly like a rewrite
  bug. A cache-missing request told the truth.
- **Never put `haven://` in an email template.** Supabase renders a custom
  scheme in a variable as `#ZgotmplZ`. The hand-off is the landing page's job.

## What this fixed (2.1.0)

Invite links built from the app's own origin (dead on desktop); invites lost
when signed out; mobile sharing unclickable `haven://` links; desktop password
reset impossible; a desktop email opened on an iPhone dead-ending; unknown
`haven://` paths rendering blank; expired links spinning for 8 seconds before
reporting an error that was known immediately.

## Where things live

| Piece                       | Path                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| Link model                  | `packages/shared/src/features/links/havenLinks.ts`                |
| Pipeline                    | `packages/shared/src/core/linkPipeline.ts`                        |
| Auth redirect builder       | `packages/shared/src/features/auth/domain/authConfirmRedirect.ts` |
| Desktop/web host + hand-off | `packages/solid-client/src/features/links/`                       |
| Confirm page decision       | `packages/solid-client/src/features/auth/authConfirmPlan.ts`      |
| Mobile intake               | `apps/mobile/src/features/links/`                                 |
| Desktop delivery            | `apps/tauri/src/bridge.ts` (`onDeepLink`)                         |
| Email templates             | `supabase/templates/`                                             |
| Universal Links             | `apps/web/public/.well-known/apple-app-site-association`          |

## Still open

- **The "Open in Haven" banner on `/invite/:code` only appears after sign-in**,
  because the route sits behind the auth gate. The more useful placement is the
  sign-in screen when a link is waiting; the pipeline knows, but doesn't expose
  a pending-link getter yet.
- **Allow-list cleanup:** `haven://auth/confirm` and
  `https://haven.redrixx.com/auth/confirm` can be removed once no shipped client
  still sends them.
- **Reloading a deep route inside the bundled desktop app** (the Tauri
  custom-protocol 404 question) is still open — see `SOLID_CLIENT_SHAPE.md`
  § Routing.
