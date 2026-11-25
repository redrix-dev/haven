---
name: haven-supabase-rls
description: Use when changing Supabase migrations, Postgres RLS policies, security-definer RPCs, database triggers, realtime broadcasts, Edge Functions, SQL fixtures, SQL/RLS tests, backend contract tests, or Supabase generated types.
---

# Haven Supabase RLS

## Read Before Editing

- [docs/architecture/DATABASE.md](../../../docs/architecture/DATABASE.md): the
  contract. How every table is read and written, the RPC and event lists, and
  the reason for each decision.
- [supabase/tests/README.md](../../../supabase/tests/README.md): how to write
  and prove a suite, and the traps.
- [docs/PRINCIPLES.md](../../../docs/PRINCIPLES.md), "Security lives in the
  database".

The database was rebuilt on 2026-11-13, with its Edge Functions
(`supabase/functions/README.md`) and the shared backend clients
(`packages/shared/src/lib/backend/`); the collections and all three apps run
on it. DATABASE.md, "What follows", says what is left.

## The Six Rules

A change that breaks one of these is wrong, whatever the app would find
convenient. Shape the database for the product; the app follows it.

1. `public` is the contract, `private` is the workings. The API exposes only
   `public`.
2. Nothing is reachable unless a line grants it. New tables and functions are
   closed by default. `anon` can do nothing.
3. Tables are read through RLS and written through RPCs. No table has a write
   grant.
4. Every RPC starts with `private.require_user()` (or `require_staff()`).
5. One way to refuse: `private.fail(kind, reason, message)`.
6. The database decides who hears about a change and sends it to each
   person's `user:<id>` topic with `private.broadcast`. No table is in a
   realtime publication.

## Adding Or Changing Something

- **A new RPC:** `security definer`, `set search_path = ''`, every name
  schema-qualified, parameters prefixed `p_`, first line `require_user()`,
  refusals through `private.fail`, and an explicit
  `grant execute … to authenticated` next to it. Then add its name to
  `supabase/tests/sql/14_api_surface.sql`, which fails until you do.
- **A new table:** enable RLS. Add a select policy and a `grant select` only
  if clients read it directly; otherwise read it through an RPC. Never grant
  insert, update or delete. Index every foreign key that points at a table
  whose rows get deleted (suite 14 checks this).
- **A new rule about who may do something:** state it once, in a `private`
  function or view, and have RLS, the RPCs and the realtime audience all call
  that. `private.channel_access` is the model.
- **A new event:** row tables announce by trigger; anything with a computed
  shape (a message) is announced by the RPC that changed it. Add it to the
  event table in DATABASE.md.
- **Something the database cannot do itself** (HTTP, storage bytes, mail):
  `private.enqueue_job`, a `worker_*` RPC, and a handler in a worker built on
  `supabase/functions/_shared/jobs.ts`. The worker asks the database again
  at the moment of acting; it never decides who may do what.
- **A new RPC the apps call:** add its method to the backend client for that
  area (`packages/shared/src/lib/backend/`). RPC and argument names are
  checked against the generated types, so regenerate them first
  (`npm run supabase:types`). Return the database's record as it is; do not
  rename fields.
- Add a new timestamped migration. Do not edit the nine baseline files once
  they are on a shared database.

## Test Discipline

- `npm run test:db` rebuilds the local database and runs every suite.
- `npm run test:db:mutations` breaks each rule and expects its suite to fail.
  **Every new rule gets a line in `supabase/tests/mutations/`.** A line that
  survives means the rule is not tested.
- `npm run test:db:auth-hook` proves sign-in is refused to a restricted
  account (the hook is a config switch; the SQL suites cannot see it).
- `npm run devdb -- reset` sends the working tree's `supabase/` to the shared
  dev backend, for trying it against real clients. See `docs/DEV_BACKEND.md`.
- `npm run test:functions` runs the Edge Function handlers with Deno against
  the local stack; `npm run test:functions:mutations` breaks each function
  rule (`supabase/functions/tests/mutations.txt`) and expects a test to fail.
- `npm run test:backend` runs the `*.contract.test.ts` files in
  `packages/shared/src/lib/backend/__tests__/`: the backend clients signed in
  as the fixture people, realtime included. `actor(key)` signs in with a
  password; `staffActor()` is the staff account with an authenticator enrolled
  and answered (aal2), which every staff RPC and case table requires. The
  runner waits until Realtime delivers a database broadcast before the first
  file, because right after `db reset` it drops them for about a second.
  Cases outlive the fixture reload, so assert on the case a test made, not on
  "everything about this person".

## Where Things Go

- Fixtures (built through real RPCs): `supabase/tests/fixtures/`
- Helpers: `supabase/tests/_helpers/`
- Suites: `supabase/tests/sql/`, listed in `supabase/tests/run_order.txt`
- Mutations: `supabase/tests/mutations/`
- Backend client contract tests: `packages/shared/src/lib/backend/__tests__/`

## Footguns

- A green UI test does not prove access control. The SQL suites do, and only
  once a mutation shows they fail on broken code.
- A direct client filter is not security.
- RLS refusals on a read do not throw: the rows are simply absent. Assert the
  count, not a rejection.
- The service role gets every function in `public` by Supabase's own default
  grants. `worker_*` functions are named for it, not hidden from it.
- A refused RPC rolls back everything it did, including the rate-limit
  attempt it counted.
- In a SQL-language function a column silently wins over a parameter of the
  same name. That is why parameters are `p_`.
- `select (f()).*` runs `f` once per output column.
- Dropping or renaming a column: regenerated types and a green typecheck do
  not prove the clients stopped using it. Backend inserts are cast `as never`,
  and RPC JSON is parsed by hand-written row parsers that may _require_ the
  field and silently drop rows without it. `git grep` the column and its
  camelCase name (HAV-19 found both).
- Generated local Supabase files under `.temp/` and `.generated/` are not
  source artifacts. `supabase link` also writes service versions there
  (`storage-version`, `storage-migration`), so a linked checkout runs the
  hosted project's storage locally and CI does not: a storage failure that
  only CI shows needs `.temp/` moved aside to reproduce.
- Bumping the `supabase` CLI in `package-lock.json` means bumping
  `setup-cli` in `ci.yml` to the same version (`npm run check:supabase-cli`
  fails until you do). Two CLIs leave storage's service and schema at
  different versions, and every upload fails with 42P10.
