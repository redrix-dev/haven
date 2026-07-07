/** Discord-style spoiler markers; aligned with mobile RNEM `||...||` parsing. */
export const COMMUNITY_SPOILER_DELIMITER = "||";
const TRAILING_SPACES_RE = /[^\S\n]+$/gm;
type TextStyle =
  | { kind: "delimited"; value: string }
  | {
      kind: "wrapped";
      styleWrapOpening: string;
      styleWrapClosing: string;
    };

export const StylesCatalog = {
  bold: {
    styleWrapOpening: "**",
    styleWrapClosing: "**",
    kind: "wrapped",
  },
  italic: {
    styleWrapOpening: "*",
    styleWrapClosing: "*",
    kind: "wrapped",
  },
  underline: {
    styleWrapOpening: "_",
    styleWrapClosing: "_",
    kind: "wrapped",
  },
  strikethrough: {
    styleWrapOpening: "~~",
    styleWrapClosing: "~~",
    kind: "wrapped",
  },
  code: {
    styleWrapOpening: "`",
    styleWrapClosing: "`",
    kind: "wrapped",
  },
  link: {
    styleWrapOpening: "[",
    styleWrapClosing: "](url)",
    kind: "wrapped",
  },
  spoiler: {
    styleWrapOpening: COMMUNITY_SPOILER_DELIMITER,
    styleWrapClosing: COMMUNITY_SPOILER_DELIMITER,
    kind: "wrapped",
  },
  blockquote: {
    value: "> ",
    kind: "delimited",
  },
  codeblock: {
    styleWrapOpening: "```\n",
    styleWrapClosing: "\n```",
    kind: "wrapped",
  },
} as const satisfies Record<string, TextStyle>;
export type StyleName = keyof typeof StylesCatalog;
export function markdownWrapHelper(
  text: string,
  start: number,
  end: number,
  style: TextStyle,
): string {
  if (style.kind === "delimited") {
    const delimiter = style.value;
    const transformed = text
      .slice(start, end)
      .split("\n")
      .map((line) => delimiter + line)
      .join("\n");
    return text.slice(0, start) + transformed + text.slice(end);
  }
  // style.kind = "wrapped"
  const wrapOpening = style.styleWrapOpening;
  const wrapClosing = style.styleWrapClosing;

  return (
    text.slice(0, start) +
    wrapOpening +
    text.slice(start, end) +
    wrapClosing +
    text.slice(end)
  );
}

export function applyMarkdown(
  styleName: StyleName,
  text: string,
  start: number,
  end: number,
): string {
  return markdownWrapHelper(text, start, end, StylesCatalog[styleName]);
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
