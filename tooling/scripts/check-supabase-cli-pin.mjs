#!/usr/bin/env node
// CI's integration lane starts Supabase with the CLI pinned in ci.yml, and the
// test scripts reset the database with the CLI in package-lock.json. Two
// versions means two storage services against one schema: on 2026-11-25 a
// lockfile bump (2.105.0 -> 2.122.1) made every upload fail with 42P10. This
// fails the fast lane when the two disagree.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const locked = lock.packages?.["node_modules/supabase"]?.version;
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const pinned =
  /uses: supabase\/setup-cli@v1\s+with:[\s\S]*?version: ([0-9.]+)/.exec(
    ci,
  )?.[1];

if (!locked || !pinned) {
  console.error(
    `Could not read the Supabase CLI versions (lockfile: ${locked}, ci.yml: ${pinned}).`,
  );
  process.exit(1);
}
if (locked !== pinned) {
  console.error(
    `Supabase CLI mismatch: package-lock.json has ${locked}, ci.yml's setup-cli pins ${pinned}. Set ci.yml to ${locked}.`,
  );
  process.exit(1);
}
console.log(`Supabase CLI pin OK: ${locked}`);
