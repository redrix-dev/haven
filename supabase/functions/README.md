# Edge Functions

The parts of Haven the database cannot do itself: talking to other services
(Expo, Resend, LiveKit, other people's websites) and moving stored bytes.
Every decision about who may do what stays in the database; a function asks
it and then acts. See [DATABASE.md](../../docs/architecture/DATABASE.md),
"Jobs and workers" and "Voice".

## The functions

| Function              | Called by                                         | Does                                                                    |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `push-worker`         | the database (`push_send`)                        | sends a notification to the person's phones through Expo                |
| `mail-worker`         | the database (`email_send`)                       | sends the staff case notice and the statement of reasons through Resend |
| `link-preview-worker` | the database (`link_preview`)                     | fetches a link's title and picture, keeps the picture in `previews`     |
| `media-worker`        | the database (`media_delete`, `media_quarantine`) | deletes unused files; moves withheld ones to `evidence`                 |
| `voice-token`         | the apps                                          | signs a voice token for a channel the database says the caller may join |
| `voice-control`       | the apps                                          | mutes, deafens or removes a voice session; enforces `remove` at LiveKit |
| `update-manifest`     | phones (Expo Updates)                             | offers the newest active OTA release for the app's runtime              |

Workers share one loop (`_shared/jobs.ts`): claim jobs of their kind, do each,
report back. A handler returns when the job is done and throws when it should
be tried again; the database decides the delay and when to give up. A worker
only runs for a request carrying `x-haven-worker-secret`.

Each function is `index.ts` (one line: serve the handler) and `handler.ts`
(the work), so the tests can call the handler directly.

## Settings

| Name                                                   | Used by                        | Without it                                                                 |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| `HAVEN_WORKER_CRON_SECRET`                             | every worker                   | workers refuse every call. 16 characters or more                           |
| `EXPO_ACCESS_TOKEN`                                    | `push-worker`                  | pushes are sent unauthenticated (fine unless Expo enhanced security is on) |
| `RESEND_API_KEY`                                       | `mail-worker`                  | mail jobs fail and wait, nothing is lost                                   |
| `HAVEN_STAFF_EMAIL`, `HAVEN_MAIL_FROM`                 | `mail-worker`                  | `legal@redrixx.com`, `Haven <alerts@redrixx.com>`                          |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `voice-token`, `voice-control` | voice answers `voice_not_configured` (503)                                 |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are given
by Supabase. Locally, put the rest in `supabase/functions/.env` (gitignored).

## Tests

```sh
npm run test:db                       # first: rebuilds the database and fixtures
npm run test:functions                # every function test
npm run test:functions -- push        # one file: tests/push.test.ts
npm run test:functions:mutations      # break each rule, expect a test to fail
```

The tests run the real handlers with Deno against the local stack: the real
database and storage, signed in as the fixture people. Only services outside
Haven are stood in for, by a small server on this machine that records what
it was sent. The link preview tests replace the network under the address
rules, never the rules themselves.

Each line of `tests/mutations.txt` breaks one rule in a function's source and
names the test that must then fail; see
`tooling/scripts/test/run-function-mutations.mjs` for the format. A new rule
gets a line. A line marked SURVIVED is a rule nothing tests.

The tests leave safety cases behind (cases cannot be deleted, by design). Run
`npm run test:db` again before trusting `test:db:quick`.
