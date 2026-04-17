import fs from "node:fs";
import path from "node:path";

/**
 * Fails if new 6-digit hex literals appear in shared TS/TSX (enforces semantic tokens).
 * Allowlisted: default HTML color input value in ServerSettingsModal (must stay #rrggbb).
 */
const root = path.join("packages", "shared", "src");
const hexLineRe = /#[0-9a-fA-F]{6}\b/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.trim().startsWith("//")) return;
    if (!hexLineRe.test(line)) return;
    if (
      rel.replace(/\\/g, "/") ===
        "features/community/components/ServerSettingsModal.tsx" &&
      /useState\("#7289da"\)/.test(line)
    ) {
      return;
    }
    violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length) {
  console.error(
    "Unexpected hex literals in packages/shared/src (use CSS variables / theme utilities):\n\n" +
      violations.join("\n"),
  );
  process.exit(1);
}
