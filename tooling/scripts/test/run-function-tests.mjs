// Runs the Edge Function tests (supabase/functions/tests) with Deno against
// the local Supabase stack. Deno is the runtime the functions run on, so the
// tests import the same handler modules the functions serve.
//
// Usage (local Supabase running, `npm run test:db` done first):
//   npm run test:functions
//   npm run test:functions -- push        (one file: tests/push.test.ts)
//
// These tests write to the local database and leave safety cases behind
// (cases cannot be deleted, by design). Run `npm run test:db` again before
// trusting `test:db:quick`.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSupabaseLocalEnv } from "./resolve-supabase-local-env.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const only = process.argv.slice(2);
const targets =
  only.length > 0
    ? only.map((name) => `supabase/functions/tests/${name}.test.ts`)
    : ["supabase/functions/tests/"];

const probe = spawnSync("deno", ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.error(
    "[functions] Deno is not installed. Get it from https://deno.com (the functions run on it).",
  );
  process.exit(1);
}

const local = resolveSupabaseLocalEnv();
const result = spawnSync(
  "deno",
  ["test", "--allow-net", "--allow-env", "--allow-read", ...targets],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      // The repo's package.json is for Node. The functions name their own
      // packages (`npm:` imports), as they do when deployed.
      DENO_NO_PACKAGE_JSON: "1",
      SUPABASE_URL: local.API_URL,
      SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      POSTGRES_URL: local.POSTGRES_URL,
    },
  },
);
process.exit(result.status ?? 1);
