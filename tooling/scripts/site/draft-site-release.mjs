#!/usr/bin/env node
// Turns a release's notes (docs/releases/<tag>.md) into a draft article for
// the haven-site "What's new" page (content/releases/<version>.json, the
// Keystatic `releases` collection in haven-site/keystatic.config.ts).
//
// The markdown stays the one source. This only re-shapes it; a person still
// writes the tagline and reads the draft before it is merged on haven-site.
//
//   npm run release:site-draft -- desktop-v2.1.0
//   npm run release:site-draft -- desktop-v2.1.0 --stdout
//
// Options: --site <path> (default ../haven-site), --date YYYY-MM-DD (default:
// the tag's commit date, else today), --force (overwrite), --stdout (print).
//
// How the markdown maps (docs/releases/README.md, "The site article"):
//   text before the first ###      -> summary
//   ### Known issues               -> callout
//   ### Install                    -> dropped (installer names belong on GitHub)
//   any other ### section          -> changes in a domain module, picked by
//                                     the heading (SECTION_DOMAINS below)
//   "- **Title** — body" bullets   -> one change each
//   the first bold title of each section, taken in turn -> highlights (max 6)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Must match `domainOptions` in haven-site/keystatic.config.ts. First match
// wins; a heading that matches nothing is "ux".
export const SECTION_DOMAINS = [
  [/\bfix/i, "bugfix"],
  [/security|sign[- ]?in|sign[- ]?up|password|privacy/i, "security"],
  [/legal|terms/i, "legal"],
  [/backend|server|database/i, "backend"],
  [/infra|build|update|release|platform/i, "infrastructure"],
  [/\bui\b|look|theme|design/i, "ui"],
];

const SKIPPED_SECTIONS = /^install/i;
const CALLOUT_SECTIONS = /^known issues/i;
const MAX_HIGHLIGHTS = 6;

export function domainForSection(heading) {
  for (const [pattern, domain] of SECTION_DOMAINS) {
    if (pattern.test(heading)) return domain;
  }
  return "ux";
}

// "desktop-v2.1.0" -> "2.1.0"
export function versionFromTag(tag) {
  const match = /^(?:[a-z]+-)?v?(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?)$/.exec(
    tag,
  );
  if (!match) throw new Error(`Not a release tag: ${tag}`);
  return match[1];
}

// "2.1.0" -> "2-1-0", the file name the site already uses.
export function slugFromVersion(version) {
  return version.replace(/\./g, "-");
}

// "- **Title** — body", "- **Title.** body", "- **Title**: body", or a plain
// bullet (all of it becomes the title).
export function parseBullet(text) {
  const bold = /^\*\*(.+?)\*\*\s*(.*)$/s.exec(text);
  if (!bold) return { title: text.trim(), body: "", bold: false };
  const title = bold[1].trim().replace(/[.:]$/, "");
  const body = bold[2].replace(/^[—–:-]\s*/, "").trim();
  return { title, body, bold: true };
}

// Splits the markdown into the intro paragraphs and its ### sections, each a
// list of bullets and paragraphs. Wrapped lines join the item above them.
export function parseNotes(markdown) {
  const intro = [];
  const sections = [];
  let current = null;
  let item = null;

  const blocks = () => (current ? current.blocks : intro);
  const flush = () => {
    if (item) blocks().push(item);
    item = null;
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (/^#{1,2}\s/.test(line)) {
      flush();
      continue;
    }
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      current = { heading: heading[1].trim(), blocks: [] };
      sections.push(current);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      item = { kind: "bullet", text: bullet[1] };
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (item) item.text += " " + line.trim();
    else item = { kind: "paragraph", text: line.trim() };
  }
  flush();
  return { intro, sections };
}

export function draftSiteRelease(markdown, { version, date }) {
  const { intro, sections } = parseNotes(markdown);
  const summary = intro
    .filter((block) => block.kind === "paragraph")
    .map((block) => block.text)
    .join(" ");
  if (!summary) throw new Error("The notes have no intro paragraph.");

  const modules = [];
  const boldTitlesBySection = [];
  let callout = { discriminant: false };

  for (const section of sections) {
    if (SKIPPED_SECTIONS.test(section.heading)) continue;
    if (CALLOUT_SECTIONS.test(section.heading)) {
      // Each bullet or paragraph is a paragraph of the callout, as written.
      const body = section.blocks.map((block) => block.text).join("\n\n");
      if (body) {
        callout = {
          discriminant: true,
          value: { title: section.heading, body },
        };
      }
      continue;
    }

    const domain = domainForSection(section.heading);
    let module = modules.find((candidate) => candidate.domain === domain);
    if (!module) {
      module = { domain, changes: [] };
      modules.push(module);
    }
    const boldTitles = [];
    for (const block of section.blocks) {
      if (block.kind !== "bullet") continue;
      const { title, body, bold } = parseBullet(block.text);
      module.changes.push({ title, body, breaking: false });
      if (bold) boldTitles.push(title);
    }
    boldTitlesBySection.push(boldTitles);
  }

  return {
    version,
    date,
    tagline: "",
    summary,
    highlights: takeInTurn(boldTitlesBySection, MAX_HIGHLIGHTS).map(
      (label) => ({ label, breaking: false }),
    ),
    modules: modules.filter((module) => module.changes.length > 0),
    callout,
    whats_next: [],
  };
}

// One from each list in turn, so every section gets a highlight before any
// section gets a second.
function takeInTurn(lists, limit) {
  const out = [];
  for (let round = 0; out.length < limit; round++) {
    let took = false;
    for (const list of lists) {
      if (round < list.length && out.length < limit) {
        out.push(list[round]);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

function tagDate(repoRoot, tag) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", tag], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const args = { tag: "", site: "", date: "", force: false, stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--site") args.site = argv[++i] ?? "";
    else if (arg === "--date") args.date = argv[++i] ?? "";
    else if (arg === "--force") args.force = true;
    else if (arg === "--stdout") args.stdout = true;
    else if (!args.tag) args.tag = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!args.tag) {
    throw new Error(
      "Usage: release:site-draft -- <tag> [--site <path>] [--date YYYY-MM-DD] [--force] [--stdout]",
    );
  }
  return args;
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = parseArgs(process.argv.slice(2));
  const notesPath = join(repoRoot, "docs/releases", `${args.tag}.md`);
  if (!existsSync(notesPath)) throw new Error(`No notes at ${notesPath}`);
  const markdown = readFileSync(notesPath, "utf8");
  if (!markdown.trim()) throw new Error(`${notesPath} is empty.`);

  const version = versionFromTag(args.tag);
  const date =
    args.date ||
    tagDate(repoRoot, args.tag) ||
    new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Bad date: ${date}`);

  const json =
    JSON.stringify(draftSiteRelease(markdown, { version, date }), null, 2) +
    "\n";
  if (args.stdout) {
    process.stdout.write(json);
    return;
  }

  const site = resolve(repoRoot, args.site || "../haven-site");
  if (!existsSync(join(site, "keystatic.config.ts"))) {
    throw new Error(`No haven-site checkout at ${site} (pass --site).`);
  }
  const out = join(
    site,
    "content/releases",
    `${slugFromVersion(version)}.json`,
  );
  if (existsSync(out) && !args.force) {
    throw new Error(`${out} exists. Pass --force to replace it.`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`Draft written: ${out}`);
  console.log(
    "Next: write the tagline and read it in Keystatic, then open a haven-site PR.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(`[release:site-draft] ${error.message}`);
    process.exit(1);
  }
}
