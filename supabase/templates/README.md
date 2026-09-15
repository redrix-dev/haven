# Auth email templates

Source of truth for the five Supabase auth emails. Supabase stores the live copy
in its own dashboard, so these files are the version-controlled original: edit
here, then paste into the dashboard.

## What changed and why

Every link now points at Haven's own landing page with a `token_hash`, instead
of Supabase's `{{ .ConfirmationURL }}`:

```
{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}/auth/confirm/web{{ end }}?token_hash={{ .TokenHash }}&type=<type>
```

- **`ConfirmationURL` verifies on the first GET.** A corporate mail scanner that
  fetches links spends the token before the person clicks, and they see "link
  invalid". A `token_hash` on our page is inert until someone presses the button.
- **`RedirectTo` is the whole landing URL**, because each client asks for its own:
  `/auth/confirm/web`, `/auth/confirm/desktop`, `/auth/confirm/ios`. The page
  then confirms in the browser or hands the link to the installed app, which is
  what makes a desktop link work when it's opened on a phone.
- **The `{{ if }}` fallback** covers emails Supabase sends without a `redirectTo`
  — a resend triggered from the dashboard, for example. Those land on the web
  page, which can still confirm.
- **Never put a `haven://` URL in a template.** Supabase renders a custom scheme
  inside a template variable as `#ZgotmplZ`, and mail clients rarely linkify it.

## Light and dark

Both `color-scheme` and `supported-color-schemes` are declared, and the dark
palette is a `prefers-color-scheme` block with `!important`. Without the metas,
iOS Mail inverts a light email itself and can leave text unreadable — which is
the bug these replace. Colors come from the app's default theme: page `#0d1626`,
card `#111a2b`, text `#e6edf7`, button `#3f79d8` on `#f4f8ff`. The button keeps
one colour in both modes, so it never depends on the inversion.

## Applying them

Dashboard → Authentication → Emails. Paste each file into its template and set
the subject:

| File                | Template             | Subject                      |
| ------------------- | -------------------- | ---------------------------- |
| `confirmation.html` | Confirm signup       | Confirm your Haven account   |
| `recovery.html`     | Reset password       | Reset your Haven password    |
| `invite.html`       | Invite user          | You're invited to Haven      |
| `magic_link.html`   | Magic link           | Your Haven sign-in link      |
| `email_change.html` | Change email address | Confirm your new Haven email |

Invite, magic link and change-email aren't reachable from Haven's code today.
They're here so that if one ever fires it looks like Haven rather than
Supabase's default.

The redirect allow-list must already contain `/auth/confirm/*` for the app
domain and for preview deploys — an unlisted `redirectTo` silently falls back to
the Site URL.

`supabase/config.toml` can point at these files (`[auth.email.template.*]` with
`content_path`) for local development. It deliberately doesn't today: that block
is also what `supabase config push` would apply to production, and these
templates are applied by hand for now.

## Watch on the first real test

`confirmation.html` sends `type=signup`. Supabase's current docs use `type=email`
in the equivalent example, and both are accepted by the app's own exchange. If a
real sign-up confirmation ever fails with an invalid-type error, switch that one
value to `email` — nothing else changes.
