/** Discord-style spoiler markers; aligned with mobile RNEM `||...||` parsing. */
export const COMMUNITY_SPOILER_DELIMITER = "||";

const TRAILING_SPACES_RE = /[^\S\n]+$/gm;

type MarkdownShortcut = {
  key: string;
  shiftKey: boolean;
  displayKey?: string;
};

type MarkdownFormat =
  | {
      kind: "wrapped";
      label: string;
      opening: string;
      closing: string;
      shortcut: MarkdownShortcut;
      trimSelection: boolean;
    }
  | {
      kind: "line-prefix";
      label: string;
      prefix: string;
      shortcut: MarkdownShortcut;
    };

/**
 * Formatting syntax the Haven composers intentionally emit.
 *
 * Mobile's enriched input is the source of truth for inline delimiters. With
 * its underline parser flag enabled, `_text_` (and legacy `__text__`) means
 * underline; italic therefore always uses `*text*`, and bold always uses
 * `**text**`. Solid's lexer mirrors that decision.
 */
export const COMMUNITY_MARKDOWN_FORMATS = {
  bold: {
    kind: "wrapped",
    label: "Bold",
    opening: "**",
    closing: "**",
    shortcut: { key: "b", shiftKey: false },
    trimSelection: true,
  },
  italic: {
    kind: "wrapped",
    label: "Italic",
    opening: "*",
    closing: "*",
    shortcut: { key: "i", shiftKey: false },
    trimSelection: true,
  },
  underline: {
    kind: "wrapped",
    label: "Underline",
    opening: "_",
    closing: "_",
    shortcut: { key: "u", shiftKey: false },
    trimSelection: true,
  },
  strikethrough: {
    kind: "wrapped",
    label: "Strikethrough",
    opening: "~~",
    closing: "~~",
    shortcut: { key: "x", shiftKey: true },
    trimSelection: true,
  },
  inlineCode: {
    kind: "wrapped",
    label: "Inline code",
    opening: "`",
    closing: "`",
    shortcut: { key: "e", shiftKey: false },
    trimSelection: true,
  },
  codeBlock: {
    kind: "wrapped",
    label: "Code block",
    opening: "```\n",
    closing: "\n```",
    shortcut: { key: "e", shiftKey: true },
    trimSelection: false,
  },
  blockquote: {
    kind: "line-prefix",
    label: "Blockquote",
    prefix: "> ",
    shortcut: { key: ">", shiftKey: true, displayKey: "." },
  },
  link: {
    kind: "wrapped",
    label: "Link",
    opening: "[",
    closing: "](url)",
    shortcut: { key: "k", shiftKey: false },
    trimSelection: true,
  },
  spoiler: {
    kind: "wrapped",
    label: "Spoiler",
    opening: COMMUNITY_SPOILER_DELIMITER,
    closing: COMMUNITY_SPOILER_DELIMITER,
    shortcut: { key: "p", shiftKey: true },
    trimSelection: true,
  },
} as const satisfies Record<string, MarkdownFormat>;

export type CommunityMarkdownFormat = keyof typeof COMMUNITY_MARKDOWN_FORMATS;

/** The renderer option that gives underscores the same meaning on mobile and Solid. */
export const COMMUNITY_MARKDOWN_MD4C_FLAGS = { underline: true } as const;

export type CommunityMarkdownEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export function matchCommunityMarkdownShortcut(input: {
  key: string;
  primaryModifier: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): CommunityMarkdownFormat | null {
  if (!input.primaryModifier || input.altKey) return null;

  const key = input.key.toLowerCase();
  for (const format of Object.keys(
    COMMUNITY_MARKDOWN_FORMATS,
  ) as CommunityMarkdownFormat[]) {
    const shortcut = COMMUNITY_MARKDOWN_FORMATS[format].shortcut;
    if (shortcut.key === key && shortcut.shiftKey === input.shiftKey) {
      return format;
    }
  }

  return null;
}

/**
 * Toggles one canonical format and returns both the wire text and the textarea
 * selection that should be restored after the controlled value updates.
 */
export function toggleCommunityMarkdown(
  formatName: CommunityMarkdownFormat,
  value: string,
  selectionStart: number,
  selectionEnd: number,
): CommunityMarkdownEdit {
  const start = clamp(Math.min(selectionStart, selectionEnd), 0, value.length);
  const end = clamp(
    Math.max(selectionStart, selectionEnd),
    start,
    value.length,
  );
  const format = COMMUNITY_MARKDOWN_FORMATS[formatName];

  return format.kind === "line-prefix"
    ? toggleLinePrefix(value, start, end, format.prefix)
    : toggleWrapped(value, start, end, format);
}

function toggleWrapped(
  value: string,
  start: number,
  end: number,
  format: Extract<MarkdownFormat, { kind: "wrapped" }>,
): CommunityMarkdownEdit {
  const { opening, closing } = format;

  if (
    end - start >= opening.length + closing.length &&
    value.slice(start, start + opening.length) === opening &&
    value.slice(end - closing.length, end) === closing
  ) {
    const content = value.slice(start + opening.length, end - closing.length);
    return {
      value: value.slice(0, start) + content + value.slice(end),
      selectionStart: start,
      selectionEnd: start + content.length,
    };
  }

  if (
    start >= opening.length &&
    value.slice(start - opening.length, start) === opening &&
    value.slice(end, end + closing.length) === closing
  ) {
    return {
      value:
        value.slice(0, start - opening.length) +
        value.slice(start, end) +
        value.slice(end + closing.length),
      selectionStart: start - opening.length,
      selectionEnd: end - opening.length,
    };
  }

  let contentStart = start;
  let contentEnd = end;
  if (format.trimSelection && start !== end) {
    const selected = value.slice(start, end);
    const leadingWhitespace = selected.match(/^\s+/)?.[0].length ?? 0;
    const trailingWhitespace = selected.match(/\s+$/)?.[0].length ?? 0;
    if (leadingWhitespace + trailingWhitespace < selected.length) {
      contentStart += leadingWhitespace;
      contentEnd -= trailingWhitespace;
    }
  }

  return {
    value:
      value.slice(0, contentStart) +
      opening +
      value.slice(contentStart, contentEnd) +
      closing +
      value.slice(contentEnd),
    selectionStart: contentStart + opening.length,
    selectionEnd: contentEnd + opening.length,
  };
}

function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): CommunityMarkdownEdit {
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const selectionEndsAtLineBoundary = end > start && value[end - 1] === "\n";
  const lastSelectedIndex = selectionEndsAtLineBoundary ? end - 1 : end;
  const nextLineBreak = value.indexOf("\n", lastSelectedIndex);
  const lineEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const removing = lines.every((line) => line.startsWith(prefix));
  const transformed = lines
    .map((line) => (removing ? line.slice(prefix.length) : prefix + line))
    .join("\n");

  if (start === end) {
    const caret = removing
      ? Math.max(lineStart, start - prefix.length)
      : start + prefix.length;
    return {
      value: value.slice(0, lineStart) + transformed + value.slice(lineEnd),
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  return {
    value: value.slice(0, lineStart) + transformed + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + transformed.length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalize a user-entered link target so it can't become a relative path.
 *
 * A bare `example.com` typed into the link dialog would otherwise render as a
 * link to a same-origin relative path. Schemes (`https:`, `mailto:`, …) and
 * absolute/protocol-relative paths are left untouched; everything else gets an
 * `https://` prefix.
 */
export function normalizeCommunityLinkUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
  if (hasScheme || url.startsWith("//") || url.startsWith("/")) return url;
  return `https://${url}`;
}

/** Build a canonical Markdown link; falls back to the URL as the visible text. */
export function buildCommunityLinkMarkdown(input: {
  text: string;
  url: string;
}): string {
  const url = normalizeCommunityLinkUrl(input.url);
  const text = input.text.trim() || url;
  return `[${text}](${url})`;
}

/**
 * Replace the current selection with a finished `[text](url)` link and return
 * the caret position (collapsed) just after the inserted link.
 */
export function insertCommunityLink(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  input: { text: string; url: string },
): CommunityMarkdownEdit {
  const start = clamp(Math.min(selectionStart, selectionEnd), 0, value.length);
  const end = clamp(
    Math.max(selectionStart, selectionEnd),
    start,
    value.length,
  );
  const snippet = buildCommunityLinkMarkdown(input);
  const caret = start + snippet.length;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/** Normalizes composer output so web/desktop/mobile agree on line endings and spoiler edges. */
export function normalizeCommunityMarkdown(value: string): string {
  const withLf = value.replace(/\r\n?/g, "\n");
  const withoutTrailingSpaces = withLf.replace(TRAILING_SPACES_RE, "");
  const withoutTrailingLinePadding = withoutTrailingSpaces.replace(/\n+$/g, "");
  return stabilizeSpoilerDelimiters(withoutTrailingLinePadding);
}

function stabilizeSpoilerDelimiters(value: string): string {
  if (!value.includes(COMMUNITY_SPOILER_DELIMITER)) {
    return value;
  }
  return value.replace(/\|\|[ \t]+/g, "||").replace(/[ \t]+\|\|/g, "||");
}

export type SpoilerSegment =
  | { kind: "markdown"; value: string }
  | { kind: "spoiler"; value: string };

/**
 * Splits markdown on non-nested `||spoiler||` regions for legacy rendering parity with mobile.
 */
export function splitCommunitySpoilerSegments(
  markdown: string,
): SpoilerSegment[] {
  const segments: SpoilerSegment[] = [];
  const re = /\|\|([\s\S]*?)\|\|/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: "markdown",
        value: markdown.slice(lastIndex, match.index),
      });
    }
    segments.push({ kind: "spoiler", value: match[1] ?? "" });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < markdown.length) {
    segments.push({ kind: "markdown", value: markdown.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ kind: "markdown", value: markdown });
  }
  return segments;
}
