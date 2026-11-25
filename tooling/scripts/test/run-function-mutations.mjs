// Proves the Edge Function tests test something: breaks one rule in the
// function source, runs the test that guards it, and expects that test to
// fail. The same discipline as run-sql-mutations.mjs, for TypeScript.
//
// Each line of supabase/functions/tests/mutations.txt is:
//   <test file>[#<test name filter>] @@ <what is broken> @@ <source file> @@ <from> @@ <to>
// `from` must appear exactly once in the source file; write \n for a line
// break. An empty `to` deletes the piece. The file is put back after every
// line, whatever happens.
//
// Usage (local Supabase running, `npm run test:db` done first):
//   npm run test:functions:mutations
//   npm run test:functions:mutations -- push     (lines for one test file)

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseLocalEnv } from "./resolve-supabase-local-env.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const functionsDir = path.join(repoRoot, "supabase/functions");
const only = process.argv[2] ?? null;

const lines = readFileSync(
  path.join(functionsDir, "tests/mutations.txt"),
  "utf8",
)
  .split(/\r?\n/)
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => line.trim() !== "" && !line.startsWith("#"));

const local = resolveSupabaseLocalEnv();
const env = {
  ...process.env,
  DENO_NO_PACKAGE_JSON: "1",
  SUPABASE_URL: local.API_URL,
  SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  POSTGRES_URL: local.POSTGRES_URL,
};

function runTest(testFile, filter) {
  const args = ["test", "--allow-net", "--allow-env", "--allow-read"];
  if (filter) args.push("--filter", filter);
  args.push(`supabase/functions/tests/${testFile}.test.ts`);
  const result = spawnSync("deno", args, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;
  // A filter that matches no test would "pass" having proved nothing.
  const ranSomething = /\b[1-9]\d* passed|\b[1-9]\d* failed/.test(output);
  return { passed: result.status === 0, ranSomething, output };
}

const counts = { caught: 0, survived: 0, invalid: 0 };
const restore = [];
process.on("SIGINT", () => {
  for (const undo of restore) undo();
  process.exit(130);
});

for (const { line, number } of lines) {
  const parts = line.split("@@").map((part) => part.trim());
  if (parts.length !== 5) {
    console.log(`INVALID  line ${number}: expected 5 parts separated by "@@"`);
    counts.invalid += 1;
    continue;
  }
  const [target, what, sourceFile] = parts;
  const from = parts[3].replaceAll("\\n", "\n");
  const to = parts[4].replaceAll("\\n", "\n");
  const [testFile, filter] = target.split("#");
  if (only && testFile !== only) continue;

  const sourcePath = path.join(functionsDir, sourceFile);
  const original = readFileSync(sourcePath, "utf8");
  const found = original.split(from).length - 1;
  if (found !== 1) {
    console.log(
      `INVALID  ${what}: "${from}" appears ${found} times in ${sourceFile}`,
    );
    counts.invalid += 1;
    continue;
  }

  const undo = () => writeFileSync(sourcePath, original);
  restore.push(undo);
  let result;
  try {
    writeFileSync(sourcePath, original.replace(from, to));
    result = runTest(testFile, filter);
  } finally {
    undo();
    restore.pop();
  }

  // A break that does not compile proves nothing about the tests.
  if (!result.ranSomething) {
    const why = /TS\d{4}/.test(result.output)
      ? "the break does not typecheck"
      : `no test ran (filter "${filter ?? ""}")`;
    console.log(`INVALID  ${what}: ${why}`);
    counts.invalid += 1;
  } else if (result.passed) {
    console.log(`SURVIVED ${what}  (${testFile}.test.ts still passes)`);
    counts.survived += 1;
  } else {
    console.log(`caught   ${what}`);
    counts.caught += 1;
  }
}

console.log(
  `\n[function-mutations] caught=${counts.caught} survived=${counts.survived} invalid=${counts.invalid}`,
);
process.exit(counts.survived + counts.invalid > 0 ? 1 : 0);
