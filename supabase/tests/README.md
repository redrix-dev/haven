# Database tests

SQL suites that run against a local Supabase stack through `psql`. What the
database promises is in
[docs/architecture/DATABASE.md](../../docs/architecture/DATABASE.md); these
suites are where each promise is checked.

## Commands

| Command                     | What it does                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- |
| `npm run test:db`           | Rebuild the local database, make the test users, load fixtures, run every suite |
| `npm run test:db:rls`       | Helpers, fixtures and suites, without rebuilding                                |
| `npm run test:db:quick`     | Helpers and suites only (fixtures already loaded)                               |
| `npm run test:db:mutations` | Break each rule and expect its suite to fail (see below)                        |
| `npm run test:db:auth-hook` | Sign in through the real Auth API to prove the restriction hook is on           |

`npm run test:db:mutations -- communities` runs one file; add a suite number
(`-- communities 04`) to run one suite's lines.

## Layout

- `_helpers/` — assertions (`00`), setting who is signed in (`01`), and the
  test actors, expected errors and broadcast counting (`02`).
- `fixtures/00_hearth.sql` — the baseline: the community `TEST: Hearth`, built
  through the same RPCs the apps call. The SQL suites, the backend tests and
  the dev backend all start from it.
- `sql/NN_name.sql` — one suite per area. Each is `begin; … rollback;`, so
  nothing it does persists.
- `mutations/*.txt` — the proof that the suites test something.
- `run_order.txt` — what `test:db` runs, in order. **A suite that is not
  listed here does not run.** Check the log names a new suite before counting
  it.

## Writing a suite

```sql
select test_support.become('member_a');          -- act as a test user: RLS and grants apply
select test_support.expect_error($$ select public.kick_member(…) $$, 'missing_permission');
select test_support.become(null);                -- back to the superuser, to look at the truth
select test_support.assert_eq_int(test_support.sent('member_b', 'member.left'), 1, 'members hear it');
```

The seven actors are `owner`, `member_a`, `member_b`, `non_member`,
`server_mod`, `staff_active` and `staff_inactive`. `expect_error` matches the
reason word (`details`) of a Haven refusal, or part of the message for an
error Postgres raised itself. `sent` and `last_sent` read
`realtime.messages`, where a broadcast made inside the transaction can be
seen; `clear_sent()` first, so the count is about one action.

Write the assertion message as the rule in plain words ("a banned person
cannot rejoin"). When it fails, that sentence is the report.

## Proving a suite

A test that still passes on broken code is worse than no test. Every rule has
a line in `mutations/`:

```
04 @@ a banned person can rejoin @@ select pg_temp.mutate('public.join_community(text)', $m$if exists (select 1 from public.community_bans …) then$m$, $m$if false then$m$);
```

`<suite> @@ <what is broken> @@ <sql that breaks it>`. The runner applies the
break and runs the suite in one transaction, and expects the suite to fail.

- `pg_temp.mutate(function, from, to)` rewrites a function with one piece of
  its source replaced. `pg_temp.mutate_view` does the same for a view (match
  the text `pg_get_viewdef` prints). A policy, trigger, grant or constraint
  is broken with plain SQL.
- A line is one line. The piece to replace cannot span a line break; pick a
  piece that sits on one.
- **SURVIVED** means nothing tests that rule: add the assertion. Sometimes it
  means the check cannot be reached at all; then delete the check, and the
  line with it.
- **INVALID** means the break itself failed to apply (a renamed variable, a
  typo). Fix the line.

## Traps

Each of these produced a wrong result while these suites were written.

- **`select (f()).*` runs `f` once per column.** Use `select * from f()`.
  `(f()).one_column` is fine.
- **A statement cannot see rows it is creating.** `… where id = f_that_inserts()`
  finds nothing. Put the result in a temp table first.
- **Temp tables and `pg_temp` functions need a grant** to be used while acting
  as a test user: `grant select on t to public;`. New functions are closed by
  default in this database, test helpers included.
- **`'permission denied'` is too loose for an insert.** A table whose id
  defaults to `private.uuid_v7()` refuses a direct insert twice: once for the
  table and once for the function. Write `'permission denied for table x'`,
  or the test passes even after the table is opened.
- **A refused call leaves no trace.** The error rolls back everything the RPC
  did, including the rate-limit attempt it counted.
- **`now()` does not move inside a transaction.** To test "after ten minutes",
  move the row's timestamp back; do not wait.
- **Same `created_at` everywhere.** Rows made in one test share a timestamp.
  Order by `id`, which is time-ordered.

## macOS 27: Supabase CLI killed on launch

If `npx supabase start` (or `npm run test:db`) dies at once with SIGKILL /
exit 137, macOS is rejecting the npm CLI binary's ad-hoc signature
(`codesign --verify` reports "invalid signature"; a fresh `npm ci` copy is
the same, so it is upstream, not tampering — seen with CLI 2.105.0).
Re-sign the local copy after each install:

```sh
codesign --force --sign - node_modules/@supabase/cli-darwin-arm64/bin/supabase
```
