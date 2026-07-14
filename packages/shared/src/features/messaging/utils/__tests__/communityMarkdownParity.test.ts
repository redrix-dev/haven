import { describe, expect, it } from "vitest";
import {
  buildCommunityLinkMarkdown,
  COMMUNITY_MARKDOWN_FORMATS,
  COMMUNITY_MARKDOWN_MD4C_FLAGS,
  insertCommunityLink,
  matchCommunityMarkdownShortcut,
  normalizeCommunityLinkUrl,
  normalizeCommunityMarkdown,
  splitCommunitySpoilerSegments,
  toggleCommunityMarkdown,
} from "@shared/features/messaging/utils/communityMarkdownParity";

describe("community markdown format contract", () => {
  it("uses the same canonical inline delimiters as the mobile enriched input", () => {
    expect(COMMUNITY_MARKDOWN_FORMATS.bold).toMatchObject({
      opening: "**",
      closing: "**",
    });
    expect(COMMUNITY_MARKDOWN_FORMATS.italic).toMatchObject({
      opening: "*",
      closing: "*",
    });
    expect(COMMUNITY_MARKDOWN_FORMATS.underline).toMatchObject({
      opening: "_",
      closing: "_",
    });
    expect(COMMUNITY_MARKDOWN_FORMATS.strikethrough).toMatchObject({
      opening: "~~",
      closing: "~~",
    });
    expect(COMMUNITY_MARKDOWN_FORMATS.spoiler).toMatchObject({
      opening: "||",
      closing: "||",
    });
    expect(COMMUNITY_MARKDOWN_MD4C_FLAGS).toEqual({ underline: true });
  });

  it("maps the agreed primary-modifier shortcuts from the contract", () => {
    expect(
      matchCommunityMarkdownShortcut({
        key: "B",
        primaryModifier: true,
        shiftKey: false,
      }),
    ).toBe("bold");
    expect(
      matchCommunityMarkdownShortcut({
        key: "E",
        primaryModifier: true,
        shiftKey: true,
      }),
    ).toBe("codeBlock");
    expect(
      matchCommunityMarkdownShortcut({
        key: ">",
        primaryModifier: true,
        shiftKey: true,
      }),
    ).toBe("blockquote");
    expect(
      matchCommunityMarkdownShortcut({
        key: "b",
        primaryModifier: false,
        shiftKey: false,
      }),
    ).toBeNull();
  });
});

describe("toggleCommunityMarkdown", () => {
  it("wraps and unwraps a selection while preserving the selected content", () => {
    const wrapped = toggleCommunityMarkdown("bold", "hello", 0, 5);
    expect(wrapped).toEqual({
      value: "**hello**",
      selectionStart: 2,
      selectionEnd: 7,
    });
    expect(
      toggleCommunityMarkdown(
        "bold",
        wrapped.value,
        wrapped.selectionStart,
        wrapped.selectionEnd,
      ),
    ).toEqual({ value: "hello", selectionStart: 0, selectionEnd: 5 });
  });

  it("unwraps when the selected range includes the markers", () => {
    expect(toggleCommunityMarkdown("spoiler", "||secret||", 0, 10)).toEqual({
      value: "secret",
      selectionStart: 0,
      selectionEnd: 6,
    });
  });

  it("inserts paired markers with the caret between them for an empty selection", () => {
    expect(toggleCommunityMarkdown("italic", "say ", 4, 4)).toEqual({
      value: "say **",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(toggleCommunityMarkdown("codeBlock", "", 0, 0)).toEqual({
      value: "```\n\n```",
      selectionStart: 4,
      selectionEnd: 4,
    });
    expect(toggleCommunityMarkdown("link", "", 0, 0)).toEqual({
      value: "[](url)",
      selectionStart: 1,
      selectionEnd: 1,
    });
    expect(toggleCommunityMarkdown("blockquote", "", 0, 0)).toEqual({
      value: "> ",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("hugs inline markers to content like the mobile serializer", () => {
    expect(toggleCommunityMarkdown("underline", " hello ", 0, 7)).toEqual({
      value: " _hello_ ",
      selectionStart: 2,
      selectionEnd: 7,
    });
  });

  it("toggles blockquote prefixes across complete selected lines", () => {
    const quoted = toggleCommunityMarkdown("blockquote", "one\ntwo", 0, 7);
    expect(quoted).toEqual({
      value: "> one\n> two",
      selectionStart: 0,
      selectionEnd: 11,
    });
    expect(
      toggleCommunityMarkdown(
        "blockquote",
        quoted.value,
        quoted.selectionStart,
        quoted.selectionEnd,
      ),
    ).toEqual({ value: "one\ntwo", selectionStart: 0, selectionEnd: 7 });
  });
});

describe("normalizeCommunityMarkdown", () => {
  it("normalizes line endings, trailing line spaces, and spoiler pipe padding", () => {
    const input = "a\r\nb  \n|| spoiler ||   ";
    const normalized = normalizeCommunityMarkdown(input);
    expect(normalized).toBe("a\nb\n||spoiler||");
    expect(normalizeCommunityMarkdown(normalized)).toBe(normalized);
  });
});

describe("community link building", () => {
  it("prefixes https:// only when no scheme or absolute path is present", () => {
    expect(normalizeCommunityLinkUrl("example.com")).toBe(
      "https://example.com",
    );
    expect(normalizeCommunityLinkUrl("  example.com/x  ")).toBe(
      "https://example.com/x",
    );
    expect(normalizeCommunityLinkUrl("https://example.com")).toBe(
      "https://example.com",
    );
    expect(normalizeCommunityLinkUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(normalizeCommunityLinkUrl("//cdn.example.com")).toBe(
      "//cdn.example.com",
    );
    expect(normalizeCommunityLinkUrl("/relative")).toBe("/relative");
    expect(normalizeCommunityLinkUrl("")).toBe("");
  });

  it("falls back to the normalized URL as visible text when text is blank", () => {
    expect(buildCommunityLinkMarkdown({ text: "", url: "example.com" })).toBe(
      "[https://example.com](https://example.com)",
    );
    expect(
      buildCommunityLinkMarkdown({ text: "  ", url: "https://x.com" }),
    ).toBe("[https://x.com](https://x.com)");
    expect(
      buildCommunityLinkMarkdown({ text: "Google", url: "google.com" }),
    ).toBe("[Google](https://google.com)");
  });

  it("replaces the selection with the link and collapses the caret after it", () => {
    // Selection "Google" (indices 4..10) becomes the link text.
    expect(
      insertCommunityLink("see Google now", 4, 10, {
        text: "Google",
        url: "google.com",
      }),
    ).toEqual({
      value: "see [Google](https://google.com) now",
      selectionStart: 32,
      selectionEnd: 32,
    });
  });

  it("inserts at the caret when there is no selection", () => {
    const edit = insertCommunityLink("go ", 3, 3, {
      text: "here",
      url: "https://x.com",
    });
    expect(edit.value).toBe("go [here](https://x.com)");
    expect(edit.selectionStart).toBe(edit.value.length);
    expect(edit.selectionEnd).toBe(edit.value.length);
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
