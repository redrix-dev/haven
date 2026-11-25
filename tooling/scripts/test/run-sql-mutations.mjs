// Proves the SQL suites by breaking what they guard.
//
// Each line of a file in supabase/tests/mutations/ is
//
//   <suite number> @@ <what is broken> @@ <sql that breaks it>
//
// For every line this runs the mutation and then the suite, in ONE
// transaction, and expects the suite to fail. Nothing persists: inside an open
// transaction the suite's own "begin" is a no-op and its "rollback" (or the
// connection dropping after a failed assertion) undoes the mutation too.
//
// A mutation that the suite survives means a rule nothing tests. Add the
// assertion, do not delete the line.
//
// Usage (local Supabase running, fixtures loaded by `npm run test:db`):
//   npm run test:db:mutations                 every file, every line
//   npm run test:db:mutations -- reporting    one file
//   npm run test:db:mutations -- reporting 27 one file, one suite
//
// To break a function, use pg_temp.mutate(function, from, to): it rewrites
// the function with one piece of its source replaced, and fails loudly if
// that piece is not there (so a renamed variable cannot turn a mutation into
// a silent no-op). Dollar-quote the pieces ($m$...$m$) to avoid escaping.
// pg_temp.mutate_view(view, from, to) does the same for a view. A policy,
// trigger, grant or constraint is broken with plain SQL (drop and recreate).

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseLocalEnv } from "./resolve-supabase-local-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const mutationsDir = path.join(repoRoot, "supabase/tests/mutations");
const suitesDir = path.join(repoRoot, "supabase/tests/sql");

const APPLIED = "__mutation_applied__";

const PRELUDE = `
create function pg_temp.mutate(p_function regprocedure, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_definition text := pg_get_functiondef(p_function);
begin
  if position(p_from in v_definition) = 0 then
    raise exception 'mutation target not found in %: %', p_function, p_from;
  end if;
  execute replace(v_definition, p_from, p_to);
end;
$$;
-- The same for a view. Postgres stores a view as its parsed form, so p_from
-- is matched against what "select pg_get_viewdef('the.view')" prints, not
-- against the migration text.
create function pg_temp.mutate_view(p_view regclass, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_definition text := pg_get_viewdef(p_view);
begin
  if position(p_from in v_definition) = 0 then
    raise exception 'mutation target not found in %: %', p_view, p_from;
  end if;
  execute 'create or replace view ' || p_view || ' as ' || replace(v_definition, p_from, p_to);
end;
$$;
`;

function suiteFile(suiteNumber) {
  const match = readdirSync(suitesDir).find((name) =>
    name.startsWith(`${suiteNumber}_`),
  );
  if (!match) throw new Error(`No SQL suite starts with ${suiteNumber}_`);
  return path.join(suitesDir, match);
}

function readMutations(fileName) {
  return readFileSync(path.join(mutationsDir, fileName), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split(" @@ ");
      if (parts.length !== 3) {
        throw new Error(
          `${fileName}: expected "suite @@ name @@ sql": ${line}`,
        );
      }
      return { suite: parts[0].trim(), name: parts[1].trim(), sql: parts[2] };
    });
}

function main() {
  const [onlyFile, onlySuite] = process.argv.slice(2);
  const env = resolveSupabaseLocalEnv();
  const files = readdirSync(mutationsDir)
    .filter((name) => name.endsWith(".txt"))
    .filter((name) => !onlyFile || name === `${onlyFile}.txt`);
  if (files.length === 0) throw new Error("No mutation files selected.");

  const counts = { caught: 0, survived: 0, invalid: 0 };

  for (const fileName of files) {
    for (const mutation of readMutations(fileName)) {
      if (onlySuite && mutation.suite !== onlySuite) continue;

      // The marker is printed only if the mutation itself applied. An error
      // before it means the line is wrong, not that the suite caught anything.
      const script = [
        PRELUDE,
        "begin;",
        mutation.sql,
        `\\echo ${APPLIED}`,
        readFileSync(suiteFile(mutation.suite), "utf8"),
      ].join("\n");
      const result = spawnSync(
        "psql",
        [env.POSTGRES_URL, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        { input: script, encoding: "utf8", cwd: repoRoot },
      );
      if (result.error) throw result.error;

      const firstError =
        `${result.stdout}\n${result.stderr}`
          .split(/\r?\n/)
          .find((line) => /ERROR:/.test(line))
          ?.slice(0, 200) ?? "";
      const label = `[${mutation.suite}] ${mutation.name}`;

      if (result.status === 0) {
        counts.survived += 1;
        console.log(`SURVIVED  ${label}`);
      } else if (!result.stdout.includes(APPLIED)) {
        counts.invalid += 1;
        console.log(`INVALID   ${label} :: ${firstError}`);
      } else {
        counts.caught += 1;
        console.log(`caught    ${label} :: ${firstError}`);
      }
    }
  }

  console.log(
    `\n[sql-mutations] caught=${counts.caught} survived=${counts.survived} invalid=${counts.invalid}`,
  );
  if (counts.survived > 0 || counts.invalid > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error("[sql-mutations] Failed:", error);
  process.exitCode = 1;
}
