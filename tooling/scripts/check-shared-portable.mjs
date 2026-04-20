import fs from "node:fs";
import path from "node:path";

/**
 * CI guardrail: portable `packages/shared` must not reintroduce the old
 * import-time Supabase singleton or direct public Supabase env reads.
 *
 * Broader DOM/Radix eviction is tracked manually; this script enforces the
 * data-plane boundary that Metro/Vitest rely on.
 */
const sharedRoot = path.join("packages", "shared", "src");
const bannedSingletonFile = path.join("packages", "shared", "src", "lib", "supabase.ts");

const importSupabaseRe = /@shared\/lib\/supabase\b/;
const envSupabaseRe =
  /process\.env\.(?:SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(line) {
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

const violations = [];

if (fs.existsSync(bannedSingletonFile)) {
  violations.push(
    `Forbidden file still exists: ${path.normalize(bannedSingletonFile)}`,
  );
}

for (const file of walk(sharedRoot)) {
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = stripComments(rawLine);
    if (importSupabaseRe.test(line)) {
      violations.push(`${rel}:${i + 1}: import of deprecated @shared/lib/supabase`);
    }
    if (envSupabaseRe.test(line)) {
      violations.push(
        `${rel}:${i + 1}: direct process.env Supabase read in portable shared (use host wiring + createHavenSupabaseClient)`,
      );
    }
  });
}

if (violations.length) {
  console.error(
    "check:shared-portable failed — packages/shared/src data-plane violations:\n\n" +
      violations.join("\n"),
  );
  process.exit(1);
}

console.log("check:shared-portable: OK");
