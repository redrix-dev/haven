import { describe, expect, it } from "vitest";
import {
  normalizeCommunityMarkdown,
  splitCommunitySpoilerSegments,
} from "@shared/features/messaging/utils/communityMarkdownParity";

describe("normalizeCommunityMarkdown", () => {
  it("normalizes line endings, trailing line spaces, and spoiler pipe padding", () => {
    const input = "a\r\nb  \n|| spoiler ||   ";
    const normalized = normalizeCommunityMarkdown(input);
    expect(normalized).toBe("a\nb\n||spoiler||");
    expect(normalizeCommunityMarkdown(normalized)).toBe(normalized);
  });
});

describe("splitCommunitySpoilerSegments", () => {
  it("splits non-nested ||spoiler|| regions", () => {
    expect(splitCommunitySpoilerSegments("a ||x|| b")).toEqual([
      { kind: "markdown", value: "a " },
      { kind: "spoiler", value: "x" },
      { kind: "markdown", value: " b" },
    ]);
  });
});
