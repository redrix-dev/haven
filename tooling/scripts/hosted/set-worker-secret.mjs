#!/usr/bin/env node
// Points the hosted database at its Edge Functions and gives both sides a new
// shared worker secret (docs/architecture/DATABASE.md, "Setting up a
// project", step 2). Run it again any time to rotate the secret.
//
//   node tooling/scripts/hosted/set-worker-secret.mjs
//
// Uses the project this checkout is linked to (supabase/.temp/project-ref).
// The secret is generated here, handed to the CLI through files that are
// deleted afterwards, and never printed. Nobody needs to know it: the
// database and the functions are the only things that use it.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ref = readFileSync(
  join(repoRoot, "supabase/.temp/project-ref"),
  "utf8",
).trim();
if (!/^[a-z0-9]{20}$/.test(ref))
  throw new Error(`Unexpected project ref: ${ref}`);

const secret = randomBytes(32).toString("hex"); // 64 characters
const edgeBaseUrl = `https://${ref}.supabase.co/functions/v1`;
const work = mkdtempSync(join(tmpdir(), "haven-worker-secret-"));

// One command string through the shell (Windows needs it for npx). Every
// argument is written here or is a temp path, so quoting them is enough.
function supabase(args) {
  const command = ["npx", "supabase", ...args.map((arg) => `"${arg}"`)].join(
    " ",
  );
  const result = spawnSync(command, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    shell: true,
  });
  if (result.status !== 0) {
    // The CLI output never contains the secret: it is only ever in the files.
    throw new Error(
      `supabase ${args[0]} ${args[1]} failed:\n${result.stderr || result.stdout}`,
    );
  }
}

try {
  const envFile = join(work, "secret.env");
  writeFileSync(envFile, `HAVEN_WORKER_CRON_SECRET=${secret}\n`, {
    mode: 0o600,
  });
  supabase(["secrets", "set", "--env-file", envFile, "--project-ref", ref]);
  console.log("Edge Functions: HAVEN_WORKER_CRON_SECRET set.");

  const sqlFile = join(work, "settings.sql");
  writeFileSync(
    sqlFile,
    `select private.set_setting('edge_base_url', '${edgeBaseUrl}');\n` +
      `select private.set_setting('worker_secret', '${secret}');\n`,
    { mode: 0o600 },
  );
  supabase(["db", "query", "--linked", "-f", sqlFile]);
  console.log(`Database: edge_base_url = ${edgeBaseUrl}, worker_secret set.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
