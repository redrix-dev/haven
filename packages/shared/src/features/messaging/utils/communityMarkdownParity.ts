/** Discord-style spoiler markers; aligned with mobile RNEM `||...||` parsing. */
export const COMMUNITY_SPOILER_DELIMITER = "||";
const TRAILING_SPACES_RE = /[^\S\n]+$/gm;
type TextStyle =
  | { kind: "delimited"; styleName: string; value: string }
  | {
      kind: "wrapped";
      styleName: string;
      styleWrapOpening: string;
      styleWrapClosing: string;
    };

const StylesArray = [
  {
    styleName: "bold",
    styleWrapOpening: "**",
    styleWrapClosing: "**",
    kind: "wrapped",
  },
  {
    styleName: "italic",
    styleWrapOpening: "*",
    styleWrapClosing: "*",
    kind: "wrapped",
  },
  {
    styleName: "underline",
    styleWrapOpening: "_",
    styleWrapClosing: "_",
    kind: "wrapped",
  },
  {
    styleName: "strikethrough",
    styleWrapOpening: "~~",
    styleWrapClosing: "~~",
    kind: "wrapped",
  },
  {
    styleName: "inline-code",
    styleWrapOpening: "`",
    styleWrapClosing: "`",
    kind: "wrapped",
  },
  {
    styleName: "link",
    styleWrapOpening: "[text]",
    styleWrapClosing: "(url)",
    kind: "wrapped",
  },
  {
    styleName: "spoiler",
    styleWrapOpening: COMMUNITY_SPOILER_DELIMITER,
    styleWrapClosing: COMMUNITY_SPOILER_DELIMITER,
    kind: "wrapped",
  },
  { styleName: "blockquote", value: ">", kind: "delimited" },
  { styleName: "codeblock", syntax: "```", kind: "TODO" },
] as const satisfies readonly TextStyle[];
type StyleName = (typeof StylesArray)[number]["styleName"];

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
