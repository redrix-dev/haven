import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  draftSiteRelease,
  parseBullet,
  slugFromVersion,
  versionFromTag,
} from "../draft-site-release.mjs";

const NOTES = `## Haven 9.9.9

A small release. It fixes
two things.

Second paragraph.

### Messages

- **Formatting toolbar** — bold, italic and code,
  with shortcuts.
- **Links work.** Pasted links behave.
- Plain bullet with no title.

### Sign-in emails

- **Scanner-safe links**: they land on a page.

### Communities

- **Channel groups** — organize channels.

### Install

- **Windows** — \`Haven_9.9.9_x64-setup.exe\`

### Known issues

- **Pop-out hidden** — needs a new event path.
- SmartScreen prompts once.
`;

const draft = draftSiteRelease(NOTES, { version: "9.9.9", date: "2026-11-24" });

test("tags become versions and file names", () => {
  assert.equal(versionFromTag("desktop-v2.1.0"), "2.1.0");
  assert.equal(versionFromTag("v1.7.1"), "1.7.1");
  assert.equal(versionFromTag("mobile-v1.0.0-rc.1"), "1.0.0-rc.1");
  assert.throws(() => versionFromTag("staging"));
  assert.equal(slugFromVersion("2.0.1"), "2-0-1");
});

test("bullets split into title and body", () => {
  assert.deepEqual(parseBullet("**A** — b"), {
    title: "A",
    body: "b",
    bold: true,
  });
  assert.deepEqual(parseBullet("**A.** b"), {
    title: "A",
    body: "b",
    bold: true,
  });
  assert.deepEqual(parseBullet("**A**: b"), {
    title: "A",
    body: "b",
    bold: true,
  });
  assert.deepEqual(parseBullet("just text"), {
    title: "just text",
    body: "",
    bold: false,
  });
});

test("intro paragraphs become the summary, wrapped lines joined", () => {
  assert.equal(
    draft.summary,
    "A small release. It fixes two things. Second paragraph.",
  );
  assert.equal(draft.tagline, "");
  assert.equal(draft.date, "2026-11-24");
});

test("sections become domain modules; same domain merges; Install is dropped", () => {
  assert.deepEqual(
    draft.modules.map((m) => [m.domain, m.changes.map((c) => c.title)]),
    [
      [
        "ux",
        [
          "Formatting toolbar",
          "Links work",
          "Plain bullet with no title.",
          "Channel groups",
        ],
      ],
      ["security", ["Scanner-safe links"]],
    ],
  );
  assert.equal(
    draft.modules[0].changes[0].body,
    "bold, italic and code, with shortcuts.",
  );
  assert.ok(!JSON.stringify(draft).includes("setup.exe"));
});

test("highlights take one bold title per section in turn", () => {
  assert.deepEqual(
    draft.highlights.map((h) => h.label),
    [
      "Formatting toolbar",
      "Scanner-safe links",
      "Channel groups",
      "Links work",
    ],
  );
});

test("known issues become the callout", () => {
  assert.deepEqual(draft.callout, {
    discriminant: true,
    value: {
      title: "Known issues",
      body: "**Pop-out hidden** — needs a new event path.\n\nSmartScreen prompts once.",
    },
  });
});

test("the real 2.1.0 notes draft every section without losing a bullet", () => {
  const markdown = readFileSync(
    new URL("../../../../docs/releases/desktop-v2.1.0.md", import.meta.url),
    "utf8",
  );
  const real = draftSiteRelease(markdown, {
    version: "2.1.0",
    date: "2026-09-22",
  });
  const changes = real.modules.flatMap((m) => m.changes);
  // Links 4, emails 6, messages 3, communities 5, voice 1.
  assert.equal(changes.length, 19);
  assert.equal(real.highlights.length, 6);
  assert.ok(real.summary.startsWith("A feature release on top of 2.0.2."));
  assert.equal(real.callout.value.title, "Known issues");
});
