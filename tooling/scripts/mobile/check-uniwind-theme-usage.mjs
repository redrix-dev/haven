import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isThemeRuleAllowed as isAllowed } from "./uniwind-theme-allow.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileSrcRoot = path.join(repoRoot, "apps/mobile/src");

const RULES = {
  directIonicons: "mobile-theme/no-direct-ionicons",
  directLucideJsx: "mobile-theme/no-direct-lucide-jsx",
  rawColorProp: "mobile-theme/no-raw-color-prop",
  rawStyleColor: "mobile-theme/no-raw-style-color",
  rawHexClass: "mobile-theme/no-raw-hex-class",
  rawPaletteClass: "mobile-theme/no-raw-palette-class",
};

const DIRECT_IONICONS_ALLOWLIST = new Set([
  "apps/mobile/src/theme-rn/ThemedIonicons.tsx",
]);

const RAW_COLOR_PATH_ALLOWLIST = [
  "apps/mobile/src/theme-rn/",
  "apps/mobile/src/lib/reusables-theme.generated.ts",
];

const COLOR_PROPS = [
  "color",
  "placeholderTextColor",
  "tintColor",
  "thumbColor",
  "selectionColor",
  "cursorColor",
  "progressTintColor",
  "progressBackgroundTintColor",
  "minimumTrackTintColor",
  "maximumTrackTintColor",
];

const PALETTE_NAMES = [
  "white",
  "black",
  "red",
  "blue",
  "amber",
  "yellow",
  "sky",
  "emerald",
  "green",
  "rose",
  "pink",
  "violet",
  "purple",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
];

const rawHex = "#[0-9A-Fa-f]{3,8}";
const rawColorPropRe = new RegExp(
  `\\b(${COLOR_PROPS.join("|")})\\s*=\\s*(?:"${rawHex}"|'${rawHex}'|\\{\\s*["']${rawHex}["']\\s*\\})`,
  "g",
);
const trackColorRe = new RegExp(
  `\\btrackColor\\s*=\\s*\\{\\{[^}]*${rawHex}`,
  "g",
);
const rawStyleColorRe = new RegExp(
  `\\b(backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|color|shadowColor|textDecorationColor|tintColor|overlayColor)\\s*:\\s*["']${rawHex}["']`,
  "g",
);
const rawHexClassRe = new RegExp(
  `\\b(text|bg|border|ring|outline|placeholder|decoration|from|via|to)-\\[${rawHex}\\](?:/\\d{1,3})?\\b`,
  "g",
);
const rawPaletteClassRe = new RegExp(
  `\\b(text|bg|border|ring|outline|placeholder|decoration|from|via|to)-(${PALETTE_NAMES.join("|")})(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`,
  "g",
);

const help = `
Usage: node tooling/scripts/mobile/check-uniwind-theme-usage.mjs [--max=N]

Flags mobile UI patterns that bypass Haven's UniWind theme tokens:
  ${RULES.directIonicons}
  ${RULES.directLucideJsx}
  ${RULES.rawColorProp}
  ${RULES.rawStyleColor}
  ${RULES.rawHexClass}
  ${RULES.rawPaletteClass}

Prefer semantic className tokens, ThemedIonicons, Icon, useCSSVariable,
useResolveClassNames, or useMobileThemeTokens.

Intentional exceptions can be marked on the same line or immediately above the
relevant JSX element (including a Prettier-expanded opening tag):
  // uniwind-theme-allow ${RULES.rawPaletteClass} - modal scrim
  // uniwind-theme-allow all - generated fallback
`.trim();

function parseArgs(argv) {
  let max = Number.POSITIVE_INFINITY;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      console.log(help);
      process.exit(0);
    }

    if (arg === "--max") {
      const value = argv[i + 1];
      i += 1;
      max = Number(value);
      continue;
    }

    if (arg.startsWith("--max=")) {
      max = Number(arg.slice("--max=".length));
      continue;
    }

    console.error(`Unknown argument: ${arg}\n\n${help}`);
    process.exit(2);
  }

  if (!Number.isFinite(max) && max !== Number.POSITIVE_INFINITY) {
    console.error("--max must be a number.");
    process.exit(2);
  }

  return { max };
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Tests aren't rendered UI — fixture data (e.g. role colors) is allowed
      // to contain raw color values.
      if (entry.name === "__tests__") continue;
      walk(fullPath, out);
      continue;
    }

    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;

    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(fullPath);
    }
  }

  return out;
}

function rel(file) {
  return path.relative(repoRoot, file).replace(/\\/g, "/");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function stripComments(source) {
  const rawLines = source.split(/\r?\n/);
  const codeLines = [];
  let inBlockComment = false;

  for (const rawLine of rawLines) {
    let code = "";
    let index = 0;

    while (index < rawLine.length) {
      if (inBlockComment) {
        const blockEnd = rawLine.indexOf("*/", index);
        if (blockEnd === -1) {
          index = rawLine.length;
          break;
        }
        inBlockComment = false;
        index = blockEnd + 2;
        continue;
      }

      const lineComment = rawLine.indexOf("//", index);
      const blockStart = rawLine.indexOf("/*", index);

      if (
        lineComment !== -1 &&
        (blockStart === -1 || lineComment < blockStart)
      ) {
        code += rawLine.slice(index, lineComment);
        break;
      }

      if (blockStart !== -1) {
        code += rawLine.slice(index, blockStart);
        inBlockComment = true;
        index = blockStart + 2;
        continue;
      }

      code += rawLine.slice(index);
      break;
    }

    codeLines.push(code);
  }

  return { rawLines, codeLines, codeSource: codeLines.join("\n") };
}

function isRawColorPathAllowed(normalizedPath) {
  return RAW_COLOR_PATH_ALLOWLIST.some((allowed) =>
    allowed.endsWith("/")
      ? normalizedPath.startsWith(allowed)
      : normalizedPath === allowed,
  );
}

function formatExcerpt(line) {
  return line.trim().replace(/\s+/g, " ");
}

function parseImportStatements(codeSource) {
  const imports = [];
  const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s*["']([^"']+)["'];?/g;
  let match;

  while ((match = importRe.exec(codeSource)) !== null) {
    imports.push({
      index: match.index,
      isTypeOnly: Boolean(match[1]),
      specifier: match[2],
      source: match[3],
      statement: match[0],
    });
  }

  return imports;
}

function parseLucideImports(imports) {
  const names = [];

  for (const imported of imports) {
    if (imported.isTypeOnly || imported.source !== "lucide-react-native") {
      continue;
    }

    const namedImport = imported.specifier.match(/\{([\s\S]*?)\}/);
    if (!namedImport) continue;

    const specifiers = namedImport[1]
      .split(",")
      .map((specifier) =>
        specifier
          .replace(/\btype\b/g, "")
          .trim()
          .split(/\s+as\s+/i)
          .at(-1)
          ?.trim(),
      )
      .filter(Boolean);

    names.push(...specifiers);
  }

  return Array.from(new Set(names));
}

function collectViolations(file) {
  const normalizedPath = rel(file);
  const source = fs.readFileSync(file, "utf8");
  const { rawLines, codeLines, codeSource } = stripComments(source);
  const imports = parseImportStatements(codeSource);
  const violations = [];

  const addViolation = (lineIndex, rule, message) => {
    if (isAllowed(rawLines, lineIndex, rule)) return;

    violations.push({
      file: normalizedPath,
      line: lineIndex + 1,
      rule,
      message,
      excerpt: formatExcerpt(rawLines[lineIndex] ?? ""),
    });
  };

  if (!DIRECT_IONICONS_ALLOWLIST.has(normalizedPath)) {
    for (const imported of imports) {
      const importsIonicons =
        imported.source === "@expo/vector-icons"
          ? /\bIonicons\b/.test(imported.specifier)
          : imported.source === "@expo/vector-icons/Ionicons";

      if (importsIonicons) {
        const line = lineNumberAt(codeSource, imported.index) - 1;
        addViolation(
          line,
          RULES.directIonicons,
          "Import ThemedIonicons from @/theme-rn instead of importing Ionicons directly.",
        );
      }
    }
  }

  for (const localName of parseLucideImports(imports)) {
    const directJsxRe = new RegExp(`<${localName}(?=[\\s>/])`, "g");

    codeLines.forEach((line, index) => {
      if (!directJsxRe.test(line)) return;
      addViolation(
        index,
        RULES.directLucideJsx,
        `Render Lucide icons through <Icon as={${localName}} ... /> so UniWind className colors apply.`,
      );
      directJsxRe.lastIndex = 0;
    });
  }

  if (!isRawColorPathAllowed(normalizedPath)) {
    codeLines.forEach((line, index) => {
      rawColorPropRe.lastIndex = 0;
      if (rawColorPropRe.test(line)) {
        addViolation(
          index,
          RULES.rawColorProp,
          "Resolve native color props from UniWind/theme tokens instead of hard-coded hex.",
        );
      }

      trackColorRe.lastIndex = 0;
      if (trackColorRe.test(line)) {
        addViolation(
          index,
          RULES.rawColorProp,
          "Resolve Switch trackColor from UniWind/theme tokens instead of hard-coded hex.",
        );
      }

      rawStyleColorRe.lastIndex = 0;
      if (rawStyleColorRe.test(line)) {
        addViolation(
          index,
          RULES.rawStyleColor,
          "Resolve style color values from UniWind/theme tokens instead of hard-coded hex.",
        );
      }

      rawHexClassRe.lastIndex = 0;
      if (rawHexClassRe.test(line)) {
        addViolation(
          index,
          RULES.rawHexClass,
          "Use semantic theme classes instead of arbitrary hex color classes.",
        );
      }

      rawPaletteClassRe.lastIndex = 0;
      if (rawPaletteClassRe.test(line)) {
        addViolation(
          index,
          RULES.rawPaletteClass,
          "Use semantic theme classes instead of raw Tailwind palette color classes.",
        );
      }
    });
  }

  return violations;
}

const { max } = parseArgs(process.argv.slice(2));
const files = walk(mobileSrcRoot);
const violations = files.flatMap(collectViolations);

if (!violations.length) {
  console.log("check:mobile-uniwind: OK");
  process.exit(0);
}

const countsByRule = new Map();
for (const violation of violations) {
  countsByRule.set(violation.rule, (countsByRule.get(violation.rule) ?? 0) + 1);
}

const summary = Array.from(countsByRule.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([rule, count]) => `  ${rule}: ${count}`)
  .join("\n");

const visibleViolations = violations.slice(0, max);
const violationLines = visibleViolations
  .map(
    (violation) =>
      `${violation.file}:${violation.line}: ${violation.rule} - ${violation.message}\n` +
      `    ${violation.excerpt}`,
  )
  .join("\n");

const hiddenCount = violations.length - visibleViolations.length;
const hiddenMessage =
  hiddenCount > 0
    ? `\n\n... ${hiddenCount} more violation(s). Re-run with --max=${violations.length} to show all.`
    : "";

console.error(
  `check:mobile-uniwind failed - ${violations.length} theme usage violation(s).\n\n` +
    `Rule summary:\n${summary}\n\n` +
    `${violationLines}${hiddenMessage}\n\n` +
    "Fix by using semantic UniWind classes, ThemedIonicons, Icon, useCSSVariable, " +
    "useResolveClassNames, or useMobileThemeTokens. Intentional invariants need a " +
    "`// uniwind-theme-allow <rule>` comment with a reason.\n",
);

process.exit(1);
