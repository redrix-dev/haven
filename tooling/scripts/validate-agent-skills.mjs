import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const skillsRoot = path.join(repoRoot, ".claude", "skills");

const allowedFrontmatterKeys = new Set(["name", "description"]);
const skillNameRe = /^[a-z0-9-]{1,63}$/;

const errors = [];

function rel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  errors.push(message);
}

function listSkillDirs() {
  if (!fs.existsSync(skillsRoot)) {
    fail(`Missing skills directory: ${rel(skillsRoot)}`);
    return [];
  }

  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name))
    .sort();
}

function parseFrontmatter(filePath, text) {
  if (!text.startsWith("---\n")) {
    fail(`${rel(filePath)}: missing opening YAML frontmatter fence`);
    return null;
  }

  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    fail(`${rel(filePath)}: missing closing YAML frontmatter fence`);
    return null;
  }

  const frontmatter = text.slice(4, end);
  const body = text.slice(end + "\n---\n".length);
  const data = {};
  const seenKeys = new Set();
  const lines = frontmatter.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (/^\s/.test(raw)) {
      fail(`${rel(filePath)}:${i + 1}: unexpected indented frontmatter line`);
      continue;
    }

    const match = raw.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      fail(`${rel(filePath)}:${i + 1}: invalid frontmatter line`);
      continue;
    }

    const [, key, rawValue = ""] = match;
    if (seenKeys.has(key)) {
      fail(`${rel(filePath)}:${i + 1}: duplicate frontmatter key "${key}"`);
    }
    seenKeys.add(key);

    if (!allowedFrontmatterKeys.has(key)) {
      fail(`${rel(filePath)}:${i + 1}: unsupported frontmatter key "${key}"`);
    }

    const value = rawValue.trim();
    if (value === ">" || value === "|") {
      const block = [];
      while (
        i + 1 < lines.length &&
        (/^\s/.test(lines[i + 1]) || !lines[i + 1].trim())
      ) {
        i += 1;
        block.push(lines[i].replace(/^\s{0,2}/, ""));
      }
      data[key] =
        value === ">"
          ? block.join(" ").replace(/\s+/g, " ").trim()
          : block.join("\n").trim();
    } else {
      data[key] = stripYamlQuotes(value);
    }
  }

  return { data, body };
}

function stripYamlQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function validateSkill(skillDir) {
  const folderName = path.basename(skillDir);
  const skillFile = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillFile)) {
    fail(`${rel(skillDir)}: missing SKILL.md`);
    return null;
  }

  const parsed = parseFrontmatter(skillFile, read(skillFile));
  if (!parsed) return skillFile;

  const { data, body } = parsed;
  const name = data.name;
  const description = data.description;

  if (!name) {
    fail(`${rel(skillFile)}: missing required frontmatter key "name"`);
  } else {
    if (name !== folderName) {
      fail(
        `${rel(skillFile)}: name "${name}" must match folder "${folderName}"`,
      );
    }
    if (!skillNameRe.test(name)) {
      fail(
        `${rel(skillFile)}: name "${name}" must be lowercase letters, digits, and hyphens, max 63 chars`,
      );
    }
  }

  if (!description) {
    fail(`${rel(skillFile)}: missing required frontmatter key "description"`);
  }

  if (!body.trim()) {
    fail(`${rel(skillFile)}: missing body content after frontmatter`);
  }

  return skillFile;
}

function isExternalLink(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function validateMarkdownLinks(filePath) {
  const text = read(filePath);
  const dir = path.dirname(filePath);
  const linkRe = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = linkRe.exec(text))) {
    const target = match[1];
    const withoutAnchor = target.split("#")[0];

    if (!withoutAnchor || isExternalLink(withoutAnchor)) continue;

    const resolved = path.normalize(path.join(dir, decodeURI(withoutAnchor)));
    if (!fs.existsSync(resolved)) {
      fail(
        `${rel(filePath)}: broken relative link "${target}" -> ${rel(resolved)}`,
      );
    }
  }
}

const skillFiles = [];
const names = new Set();

for (const skillDir of listSkillDirs()) {
  const skillFile = validateSkill(skillDir);
  if (skillFile) {
    skillFiles.push(skillFile);
    const name = path.basename(skillDir);
    if (names.has(name)) fail(`${rel(skillDir)}: duplicate skill folder`);
    names.add(name);
  }
}

for (const filePath of [
  path.join(repoRoot, "AGENTS.md"),
  path.join(repoRoot, "docs", "README.md"),
  ...skillFiles,
]) {
  if (fs.existsSync(filePath)) validateMarkdownLinks(filePath);
}

if (errors.length > 0) {
  console.error("check:agent-skills failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`check:agent-skills: OK (${skillFiles.length} skills)`);
