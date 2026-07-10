import assert from "node:assert/strict";
import test from "node:test";
import {
  allowCommentMatches,
  isThemeRuleAllowed,
} from "../uniwind-theme-allow.mjs";

const RULE = "mobile-theme/no-raw-palette-class";

test("matches targeted and all-rule allow comments", () => {
  assert.equal(
    allowCommentMatches(`// uniwind-theme-allow ${RULE} - modal scrim`, RULE),
    true,
  );
  assert.equal(
    allowCommentMatches("// uniwind-theme-allow all - generated", RULE),
    true,
  );
  assert.equal(
    allowCommentMatches(
      "// uniwind-theme-allow mobile-theme/no-raw-color-prop",
      RULE,
    ),
    false,
  );
});

test("allows a marker immediately above a Prettier-expanded JSX tag", () => {
  const lines = [
    `{/* uniwind-theme-allow ${RULE} - modal scrim */}`,
    "<Pressable",
    '  className="flex-1 bg-black/60"',
  ];

  assert.equal(isThemeRuleAllowed(lines, 2, RULE), true);
});

test("does not apply distant allow comments", () => {
  const lines = [
    `{/* uniwind-theme-allow ${RULE} - unrelated element */}`,
    "<View>",
    "  <Pressable",
    '    className="flex-1 bg-black/60"',
  ];

  assert.equal(isThemeRuleAllowed(lines, 3, RULE), false);
});
