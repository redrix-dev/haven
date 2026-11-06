import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guard for patches/expo-modules-core+58.0.28.patch.
//
// expo-modules-core 58.0.28 built from source crashes swift-frontend (SIL-gen,
// emitDestructiveCaseBlocks) under Xcode 27.2 / Swift 6.4.2 on the `as any Error`
// cast inside the `switch consume` in AsyncFunctionDefinition.build.
//   - Swift bug:   https://github.com/swiftlang/swift/issues/93625
//   - Expo report: https://github.com/expo/expo/issues/52610
//   - Upstream fix: https://github.com/expo/expo/pull/52631  (shipped in 58.0.29+)
//
// We stay pinned on 58.0.28 and carry the fix as a patch. This script fires a
// loud reminder the moment expo-modules-core moves off 58.0.28 so the stale
// patch can't silently linger after an SDK bump, and warns if the patch that
// keeps iOS from-source builds alive goes missing while still pinned.
//
// When you upgrade to >= 58.0.29 and confirm a clean iOS build under current
// Xcode: delete patches/expo-modules-core+58.0.28.patch, this script (drop it
// from apps/mobile package.json postinstall), the AGENTS.md "Known Rough Edges"
// entry, and close HAV-1.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const BASELINE = "58.0.28"; // version the patch targets
const FIXED_IN = "58.0.29"; // first upstream version containing the fix
const TAG = "[mobile:expo-core-patch]";

const pkgPath = path.join(
  repoRoot,
  "apps/mobile/node_modules/expo-modules-core/package.json",
);
const patchPath = path.join(
  repoRoot,
  "apps/mobile/patches/expo-modules-core+58.0.28.patch",
);

// Never break install; this is advisory only.
const bail = () => process.exit(0);

if (!fs.existsSync(pkgPath)) {
  // Not installed (e.g. deps not yet installed) — nothing to check.
  bail();
}

/** Compare dotted numeric versions. -1 a<b, 0 equal, 1 a>b. */
function cmp(a, b) {
  const pa = String(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function banner(lines) {
  const width = Math.max(...lines.map((l) => l.length));
  const bar = "─".repeat(width + 2);
  console.warn(`\n┌${bar}┐`);
  for (const l of lines) console.warn(`│ ${l.padEnd(width)} │`);
  console.warn(`└${bar}┘\n`);
}

let installed = "";
try {
  installed = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "";
} catch {
  bail();
}

const patchPresent = fs.existsSync(patchPath);
const rel = cmp(installed, BASELINE);

if (rel === 0) {
  // Still pinned on the patched baseline.
  if (!patchPresent) {
    banner([
      `${TAG} expo-modules-core is ${installed} but the crash patch is MISSING.`,
      `iOS from-source builds will segfault swift-frontend under Xcode 27.2+.`,
      `Restore patches/expo-modules-core+58.0.28.patch (see expo/expo#52610).`,
    ]);
  }
  // Patch present + pinned: expected steady state, stay silent.
  bail();
}

if (rel > 0) {
  const fixedIncluded = cmp(installed, FIXED_IN) >= 0;
  banner([
    `${TAG} expo-modules-core is now ${installed} (patch targets ${BASELINE}).`,
    fixedIncluded
      ? `This version includes the upstream fix (expo/expo#52631).`
      : `Check whether the AsyncFunctionDefinition.build crash is fixed here.`,
    patchPresent
      ? `patches/expo-modules-core+58.0.28.patch no longer matches and is dead.`
      : `The patch is already gone — good.`,
    `If iOS builds clean under current Xcode: remove the patch, this script`,
    `(from apps/mobile postinstall), the AGENTS.md note, and close the ticket.`,
  ]);
  bail();
}

// installed < baseline — unexpected downgrade.
banner([
  `${TAG} expo-modules-core is ${installed}, below the pinned ${BASELINE}.`,
  `The 58.0.28 crash patch will not apply to this version.`,
  `Verify this downgrade was intentional.`,
]);
bail();
