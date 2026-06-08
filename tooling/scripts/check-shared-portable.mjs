import fs from "node:fs";
import path from "node:path";

/**
 * CI guardrail: portable `packages/shared` must stay framework-free.
 *
 * Enforces:
 * - no deprecated Supabase singleton / direct env reads
 * - no react / solid-js / react-flavored zustand anywhere in shared (except
 *   documented host-layer exclusions still being relocated)
 * - browser-global and web-only imports in portable logic paths
 */
const sharedRoot = path.join("packages", "shared", "src");
const bannedSingletonFile = path.join("packages", "shared", "src", "lib", "supabase.ts");

const importSupabaseRe = /@shared\/lib\/supabase\b/;
const envSupabaseRe =
  /process\.env\.(?:SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/;
const browserGlobalRe =
  /\b(?:window\.|document\.|navigator\.|history\.|localStorage\.|sessionStorage\.)/;
const webOnlyImportRe =
  /\b(?:sonner|react-dom|react-markdown|@radix-ui\/|@tiptap\/|lucide-react|cmdk)\b/;

const portablePathChecks = [
  /^packages\/shared\/src\/contexts\/.+\.(?:ts|tsx)$/,
  /^packages\/shared\/src\/app\/hooks\/.+\.(?:ts|tsx)$/,
  /^packages\/shared\/src\/features\/.+\/hooks\/.+\.(?:ts|tsx)$/,
  /^packages\/shared\/src\/lib\/deepLinks\.ts$/,
  /^packages\/shared\/src\/platform\/urls\.ts$/,
];
const portablePathExclusions = [
  /^packages\/shared\/src\/app\/hooks\/useDesktopSettings\.ts$/,
];

/** Host-layer files still in shared during cleave — remove as each relocates. */
const frameworkImportExclusions = [
  /^packages\/shared\/src\/contexts\/.+\.(?:ts|tsx)$/,
  /^packages\/shared\/src\/features\/.+\/hooks\/.+\.(?:ts|tsx)$/,
  /^packages\/shared\/src\/core\/useHavenCore\.ts$/,
  /^packages\/shared\/src\/debug\/useDataCacheComponentProbe\.ts$/,
  /^packages\/shared\/src\/nexus\/Nexus\.ts$/,
  /^packages\/shared\/src\/nexus\/__tests__\/.+\.(?:ts|tsx)$/,
];

const frameworkImportRe =
  /\bfrom\s+["'](?:react|react-dom|solid-js|zustand|zustand\/traditional|zustand\/react)["']/;

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
  const shouldCheckPortablePath = portablePathChecks.some((pattern) =>
    pattern.test(rel),
  ) && !portablePathExclusions.some((pattern) => pattern.test(rel));
  const shouldCheckFrameworkImports = !frameworkImportExclusions.some((pattern) =>
    pattern.test(rel),
  );
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = stripComments(rawLine);
    if (shouldCheckFrameworkImports && frameworkImportRe.test(line)) {
      violations.push(
        `${rel}:${i + 1}: framework import in packages/shared (reactivity belongs in platform data layers; use zustand/vanilla in shared only if unavoidable)`,
      );
    }
    if (importSupabaseRe.test(line)) {
      violations.push(`${rel}:${i + 1}: import of deprecated @shared/lib/supabase`);
    }
    if (envSupabaseRe.test(line)) {
      violations.push(
        `${rel}:${i + 1}: direct process.env Supabase read in portable shared (use host wiring + createHavenSupabaseClient)`,
      );
    }
    if (shouldCheckPortablePath && browserGlobalRe.test(line)) {
      violations.push(
        `${rel}:${i + 1}: browser global usage in portable shared logic`,
      );
    }
    if (shouldCheckPortablePath && webOnlyImportRe.test(line)) {
      violations.push(
        `${rel}:${i + 1}: web-only dependency usage in portable shared logic`,
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
