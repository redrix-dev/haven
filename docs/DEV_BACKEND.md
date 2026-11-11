# Dev Backend

A full Supabase stack that is not production, for testing web, desktop and
mobile builds mid-development. Tracked in HAV-11.

**Same schema as production, never the same rows.** The schema is built from
`supabase/migrations`. The data is seeded and can be thrown away and rebuilt
with one command. Nothing here ever reads from or writes to the hosted project.

## Daily Use

```sh
npm run devdb -- up        # start the stack on flex, write .env.devdb
npm run devdb -- reset     # rebuild schema from your working tree, then seed
npm run devdb -- seed      # re-apply seed data without touching the schema
npm run devdb -- smoke     # prove auth, RLS, RPC, realtime, storage, functions
npm run devdb -- status
npm run devdb -- down      # stop; data is kept

# Point any command at the dev backend:
npm run devdb -- run -- npm run dev:web
npm run devdb -- run -- npm run tauri:dev
npm run devdb -- run -- npm run tauri:build
npm run devdb -- run -- npm run mobile:run:ios:device
```

Sign in with the fixture users from
`tooling/scripts/test/bootstrap-local-auth-users.mjs`, for example
`rls-owner@example.test` / `HavenTest!Owner1`.

`reset` sends **your working tree's** `supabase/` to flex first, so an unmerged
migration or edge function can be tried on every client before it is pushed.

## How It Fits Together

```
 Windows / Mac / iPhone / Android          flex (always on, tailnet only)
 ───────────────────────────────           ──────────────────────────────
 web      (vite dev)          ┐
 desktop  (tauri dev/build)   ├── http://flex5-linux:54321 ──► Supabase CLI stack
 mobile   (dev + release)     ┘        over Tailscale          Postgres, Auth, REST,
                                                               Realtime, Storage,
 npm run devdb ── ssh flex ──────────────────────────────────► Edge Functions, pg_cron
```

- **The stack** is the ordinary Supabase CLI local stack (`supabase start`), kept
  running on flex. `tooling/scripts/devdb/host.sh` is the part that runs there.
  flex needs Docker and nothing else: the CLI is installed as one binary in
  `~/.local/bin`, and the working copy lives in `~/haven-devdb`.
- **Clients choose a backend with environment variables, not code.**
  `devdb run` sets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and
  `HAVEN_DEV_BACKEND=1` for the one command it runs. Process variables win over
  `.env` files in both Vite and Expo, so the `.env` files keep pointing at
  production and nothing has to be edited back afterwards.
- **The only app change** is in `apps/mobile/app.config.js`. With
  `HAVEN_DEV_BACKEND=1` it turns production OTA updates off, allows plain http
  on Android, and names the iOS install "Haven Dev". These are native settings:
  run prebuild under `devdb run` for them to apply.
- **`.env.devdb`** (gitignored) caches the stack's URL and keys. They are the
  Supabase CLI's publicly known demo keys.

### Why plain http, and why that is safe here

Tailscale already encrypts everything between tailnet machines. Turning on
Tailscale HTTPS would add a public certificate, and every public certificate is
written to the Certificate Transparency logs, machine name included. Plain
http avoids that, and the platforms allow it:

| Target                  | Why `http://flex5-linux:54321` is allowed                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| iOS                     | `NSAllowsLocalNetworking` permits http to dotless hosts. Expo's generated `Info.plist` already sets it.                |
| macOS desktop           | Dotless hosts are allowed by default. Raw IP addresses are **not** since macOS 14.                                     |
| Desktop webview (Tauri) | The app page is `tauri://localhost` (macOS, Linux) or `http://tauri.localhost` (Windows); neither blocks http fetches. |
| Android                 | Release builds block http by default; the dev-backend flag sets `usesCleartextTraffic`.                                |
| Browser                 | `vite dev` serves the page over http, so there is no mixed content.                                                    |

**Always use the name `flex5-linux`, never the IP.** macOS blocks the IP, and
the IP changes when flex is reinstalled.

Sources: Apple
[NSAllowsLocalNetworking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking),
Apple
[TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
(a VPN is not a "local network", so no permission prompt), Tauri
[config reference](https://v2.tauri.app/reference/config/), Supabase
[local development](https://supabase.com/docs/guides/local-development),
Tailscale
[Enabling HTTPS](https://tailscale.com/docs/how-to/set-up-https-certificates).

### Keeping it private

The demo keys are public knowledge, so reachability is the only lock.

- Docker publishes ports on every address and skips the host firewall. `host.sh`
  creates the stack's Docker network with `host_binding_ipv4=127.0.0.1`, so the
  stack itself listens on loopback only.
- A small `socat` container (`haven-devdb-forward`) listens on flex's tailnet
  address and forwards the API (54321), Studio (54323) and mail viewer (54324)
  to loopback. Postgres (54322) is not forwarded.
- Binding the stack straight to the tailnet address does not work: the CLI
  connects to `127.0.0.1:54322` during `start` and `db reset`.
- Every CLI command on flex that creates containers needs
  `--network-id haven-devdb`. Without it `db reset` puts the database back on
  the CLI's default network: the other services lose it and 54322 is published
  on every address. Use `npm run devdb`, not the raw CLI, on flex.
- Never `tailscale funnel` this stack, and never tunnel it (ngrok and similar).
- `devdb` refuses any URL ending in `.supabase.co`. It never uses `--linked`;
  this repo's CLI link points at production.
- SQL runs through `docker exec` into the stack's own database container. There
  is no connection string to mistype.

## Seed Data

`seed` always runs three layers, in order. Every layer is safe to re-run.

1. **Accounts** — the seven fixture users, created through the Auth admin API.
2. **Baseline** — `supabase/tests/_helpers` and `supabase/tests/fixtures`, the
   same files the SQL and backend suites use (`TEST:RLS Community`, platform
   staff). This layer also clears the fixture users' friends, DMs and
   notifications.
3. **Dev packs** — `supabase/seeds/dev/*.sql`. `NN_name.sql` is the pack `name`.

| Pack        | What you get                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `community` | `DEV: Hearth` with a read-only channel, a moderators-only channel, a voice channel, members and a mod.  |
| `chatter`   | A short conversation: replies, an edit, a soft delete, a link, a mention, long and multi-line messages. |
| `social`    | A friendship with a DM thread and a pending friend request, made through the real RPCs.                 |
| `volume`    | 3,000 numbered messages across 60 days in `#scrollback`.                                                |
| `workers`   | Turns on the pg_cron jobs that call the edge functions, if the host has a cron secret.                  |

`npm run devdb -- seed chatter volume` rebuilds only those packs (plus layers 1
and 2, which means `social` is cleared until it is seeded again).

To add a pack, add a numbered `.sql` file. Name everything it creates with a
`DEV:` prefix or keep it inside `DEV: Hearth`, delete-then-insert so it can
re-run, and prefer calling the real RPC as the acting user
(`test_support.set_jwt_claims`) over inserting rows, so the seed exercises the
same path the apps do.

## Secrets And Voice

Edge function secrets live only on flex, in `~/haven-devdb/functions.env`.
`host.sh` creates it with a random `HAVEN_WORKER_CRON_SECRET` and copies it into
place on every sync. Never put production values in it.

Voice needs a LiveKit project. Create a **separate dev project** in LiveKit
Cloud and add `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` to that
file, then `npm run devdb -- down` and `up`. Until then `voice-token` fails and
everything else works.

Push notifications and report emails are not configured (`EXPO_ACCESS_TOKEN`,
`RESEND_API_KEY`). Mail sent by Auth is caught by the stack's mail viewer at
`http://flex5-linux:54324`. Studio is at `http://flex5-linux:54323`.

## Other Hosts

`DEVDB_HOST=local npm run devdb -- <command>` targets the stack on the machine
you are sitting at (Docker Desktop running). It is the same stack `npm run
test:db` resets, so treat its data as gone whenever tests run. Useful offline,
or to try a seed pack before sending it to flex.

`DEVDB_HOST` is an ssh alias and `DEVDB_PUBLIC_HOST` is the name clients use.
Both default to flex.

`test:db` and `test:backend` are unchanged and still use a throwaway stack on
the machine that runs them. They do not use flex.

## One-Time Setup On flex

```sh
sudo usermod -aG docker cody     # then log out and back in
```

Then, from Windows or the Mac: `npm run devdb -- up`, `reset`, `smoke`.

## What Has Been Proven

Checked on 2026-11-11 against flex, driven from Windows:

- `up`, `reset` (131 migrations, every seed layer) and `seed` re-runs.
- `smoke` passes 8 of 8 over the tailnet: sign-in, RLS, an RPC, a realtime
  websocket, storage, edge functions. It fails when the `staff-room` overwrite
  is removed (checked on the local stack).
- flex listens on `127.0.0.1` and its tailnet address only. From the LAN,
  `192.168.40.253:54321` refuses connections.
- The Mac reaches `http://flex5-linux:54321` by short name (`curl`, HTTP 200).
- The `workers` path: Postgres calling `http://kong:8000` with the cron secret
  gets 200 and a link preview job completes; a wrong secret gets 401.
- `devdb run` overrides the production `.env` for Vite and for Expo config.
- The Expo config flips OTA off, sets Android cleartext and the iOS display
  name only when `HAVEN_DEV_BACKEND=1`.

Not yet proven:

1. The iPhone resolves the short name `flex5-linux`. If it does not, use the
   full MagicDNS name plus an `NSExceptionDomains` entry.
2. A packaged macOS desktop build reaches the stack over http.
3. A dev-backend iOS and Android build signs in and stays off the OTA channel.
4. Voice, which needs the LiveKit dev project keys.
5. The stack coming back by itself after flex reboots.

Known gaps:

- `expo-push-worker` answers 500 every five minutes: there is no
  `EXPO_ACCESS_TOKEN`, on purpose.
- A packaged dev-backend desktop build still checks GitHub for updates and
  would replace itself with the production build if a newer release exists.
