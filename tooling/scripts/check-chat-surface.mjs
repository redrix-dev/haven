import fs from "node:fs";
import path from "node:path";

/**
 * CI guardrail: Haven mobile chat keyboard layout must stay inside ChatInterface.
 * Enforces RNKC standard-chat pattern (no blankSpace, no duplicate RNKC primitives).
 */
const mobileRoot = path.join("apps", "mobile");
const chatRoot = path.join(mobileRoot, "src", "components", "chat");
const kcsvWrapper = path.join(chatRoot, "internal", "ChatScrollView.tsx");
const chatInterface = path.join(chatRoot, "ChatInterface.tsx");

const allowedKcsvWrapper = kcsvWrapper.replace(/\\/g, "/");

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

function rel(file) {
  return path.relative(process.cwd(), file).replace(/\\/g, "/");
}

const violations = [];
const files = walk(path.join(mobileRoot, "src"));

const importKcsvRe =
  /import\s*\{[^}]*\bKeyboardChatScrollView\b[^}]*\}\s*from\s*["']react-native-keyboard-controller["']/;
const blankSpaceJsxRe = /\bblankSpace\s*=/;
const paddingTopInContainerRe = /contentContainerStyle\s*=\s*\{[^}]*paddingTop/;
const safeAreaBottomRe = /edges\s*=\s*\{[^}]*["']bottom["']/;
const stickyRe = /\bKeyboardStickyView\b/;
const gestureRe = /\bKeyboardGestureArea\b/;

function isChatLikeSource(source) {
  return (
    /\bChatInterface\b/.test(source) ||
    /\brenderScrollComponent\b/.test(source) ||
    /\bKeyboardChatScrollView\b/.test(source) ||
    /\bKeyboardStickyView\b/.test(source)
  );
}

for (const file of files) {
  const normalized = rel(file);

  if (normalized.includes("/node_modules/")) continue;

  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  const isChatModule = normalized.startsWith(
    "apps/mobile/src/components/chat/",
  );
  const isKcsvWrapper = normalized === allowedKcsvWrapper;
  const isChatInterface = normalized === chatInterface.replace(/\\/g, "/");
  const isDebugTs = normalized.startsWith(
    "apps/mobile/src/components/chat/debug-tooling/",
  );
  const isChatLike = isChatModule || isChatLikeSource(source);

  lines.forEach((rawLine, i) => {
    const line = stripComments(rawLine);

    if (importKcsvRe.test(line) && !isKcsvWrapper) {
      violations.push(
        `${normalized}:${i + 1}: import KeyboardChatScrollView only in internal/ChatScrollView.tsx`,
      );
    }

    if (blankSpaceJsxRe.test(line) && !isDebugTs && file.endsWith(".tsx")) {
      violations.push(
        `${normalized}:${i + 1}: blankSpace is for AI streaming UIs — use ChatInterface (see haven-mobile-chat-surface skill)`,
      );
    }

    if (isChatLike && paddingTopInContainerRe.test(line) && !isChatInterface) {
      violations.push(
        `${normalized}:${i + 1}: contentContainerStyle.paddingTop belongs in ChatInterface only`,
      );
    }

    if (isChatLike && safeAreaBottomRe.test(line) && !isChatInterface) {
      violations.push(
        `${normalized}:${i + 1}: SafeAreaView edges bottom belongs in ChatInterface only`,
      );
    }

    if (stickyRe.test(line) && !isChatModule) {
      violations.push(
        `${normalized}:${i + 1}: KeyboardStickyView belongs in ChatInterface only`,
      );
    }

    if (gestureRe.test(line) && !isChatModule) {
      violations.push(
        `${normalized}:${i + 1}: KeyboardGestureArea belongs in ChatInterface only`,
      );
    }
  });
}

if (violations.length) {
  console.error(
    "check:chat-surface failed — mobile chat surface violations:\n\n" +
      violations.join("\n") +
      "\n\nSee .cursor/skills/haven-mobile-chat-surface/SKILL.md\n",
  );
  process.exit(1);
}

console.log("check:chat-surface: OK");
