import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const mobileSrcRoot = path.join(repoRoot, "apps/mobile/src");

const EXCLUDED_SEGMENTS = ["/debug/", "/dev/"];
const ALLOW_MARKER = "mobile-typography-allow";

const RULES = {
  tinyText: "mobile-typography/no-tiny-text",
  scalingOptOut: "mobile-typography/no-scaling-opt-out",
  markdownDrift: "mobile-typography/no-ad-hoc-markdown-style",
  tinyAction: "mobile-typography/no-tiny-action-text",
};

const ACTION_LABELS = [
  "Accept",
  "Add",
  "Cancel",
  "Decline",
  "Dismiss",
  "Message",
  "Read",
  "Remove",
  "Unblock",
];

const help = `
Usage: node tooling/scripts/mobile/check-mobile-typography.mjs

Flags mobile release-visible text patterns that risk iOS Dynamic Type breakage:
  ${RULES.tinyText}
  ${RULES.scalingOptOut}
  ${RULES.markdownDrift}
  ${RULES.tinyAction}

Intentional exceptions can be marked on the same or previous line:
  // ${ALLOW_MARKER} ${RULES.tinyText} - reason
  // ${ALLOW_MARKER} all - reason
`.trim();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(help);
  process.exit(0);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(repoRoot, file).replace(/\\/g, "/");
}

function releaseVisible(file) {
  const normalized = `/${rel(file)}`;
  return !EXCLUDED_SEGMENTS.some((segment) => normalized.includes(segment));
}

function allowCommentMatches(text, rule) {
  const markerIndex = text.indexOf(ALLOW_MARKER);
  if (markerIndex === -1) return false;
  const tail = text.slice(markerIndex + ALLOW_MARKER.length).trim();
  return !tail || /\ball\b/.test(tail) || tail.includes(rule);
}

function isAllowed(lines, lineIndex, rule) {
  return (
    allowCommentMatches(lines[lineIndex] ?? "", rule) ||
    allowCommentMatches(lines[lineIndex - 1] ?? "", rule)
  );
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function addFinding(findings, file, line, rule, excerpt) {
  findings.push({
    file: rel(file),
    line,
    rule,
    excerpt: excerpt.trim().replace(/\s+/g, " "),
  });
}

const files = walk(mobileSrcRoot).filter(releaseVisible);
const findings = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);

  const checks = [
    {
      rule: RULES.tinyText,
      re: /\b(?:text-\[(?:9|10)px\]|fontSize:\s*(?:9|10)\b)/g,
    },
    {
      rule: RULES.scalingOptOut,
      re: /\b(?:allowFontScaling=\{false\}|maxFontSizeMultiplier=\{(?:0|1|1\.[0-2])\})/g,
    },
  ];

  for (const { rule, re } of checks) {
    let match;
    while ((match = re.exec(source)) !== null) {
      const line = lineNumberAt(source, match.index);
      if (!isAllowed(lines, line - 1, rule)) {
        addFinding(findings, file, line, rule, lines[line - 1] ?? "");
      }
    }
  }

  if (
    source.includes("markdownStyle={{") &&
    /markdownStyle=\{\{[\s\S]*?\b(?:fontSize|lineHeight)\s*:/m.test(source) &&
    !source.includes("createChatMarkdownStyle") &&
    !isAllowed(lines, 0, RULES.markdownDrift)
  ) {
    const line = lineNumberAt(source, source.indexOf("markdownStyle={{"));
    addFinding(findings, file, line, RULES.markdownDrift, lines[line - 1] ?? "");
  }

  for (const label of ACTION_LABELS) {
    const re = new RegExp(
      `<Text[^>]*className=["'][^"']*\\btext-xs\\b[^"']*["'][^>]*>\\s*${label}\\s*</Text>`,
      "g",
    );
    let match;
    while ((match = re.exec(source)) !== null) {
      const line = lineNumberAt(source, match.index);
      if (!isAllowed(lines, line - 1, RULES.tinyAction)) {
        addFinding(findings, file, line, RULES.tinyAction, lines[line - 1] ?? "");
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`Mobile typography check failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} ${finding.rule} ${finding.excerpt}`,
    );
  }
  console.error(`\n${help}`);
  process.exit(1);
}

console.log("Mobile typography check passed.");
