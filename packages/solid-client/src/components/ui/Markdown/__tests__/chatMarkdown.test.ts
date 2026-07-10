import { describe, expect, it } from "vitest";
import type { Tokens } from "marked";
import { lexChatMarkdown } from "../chatMarkdown";

function inlineTokenTypes(markdown: string): string[] {
  const paragraph = lexChatMarkdown(markdown)[0] as Tokens.Paragraph;
  return paragraph.tokens.map((token) => token.type);
}

describe("lexChatMarkdown", () => {
  it("keeps canonical bold and italic distinct from underscore underline", () => {
    expect(inlineTokenTypes("**bold**")).toEqual(["strong"]);
    expect(inlineTokenTypes("*italic*")).toEqual(["em"]);
    expect(inlineTokenTypes("_underline_")).toEqual(["underline"]);
  });

  it("renders legacy double-underscore text as underline like mobile", () => {
    expect(inlineTokenTypes("__underline__")).toEqual(["underline"]);
  });

  it("keeps spoiler parsing inline with the shared delimiter", () => {
    expect(inlineTokenTypes("before ||secret|| after")).toEqual([
      "text",
      "spoiler",
      "text",
    ]);
  });
});
