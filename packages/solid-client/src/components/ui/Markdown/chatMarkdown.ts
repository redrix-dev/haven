import { Marked, type Token, type TokenizerAndRendererExtension } from "marked";
import {
  COMMUNITY_MARKDOWN_FORMATS,
  COMMUNITY_SPOILER_DELIMITER,
} from "@shared/features/messaging/utils/communityMarkdownParity";

/**
 * The chat markdown lexer — the web half of the cross-platform render contract.
 *
 * Mobile renders message `content` natively (react-native-enriched-markdown,
 * GitHub flavor, `||spoiler||` parsed inline). The source-text contract lives in
 * @shared/features/messaging/utils/communityMarkdownParity.ts: composers call
 * normalizeCommunityMarkdown() before send, and `||…||` (lazy, non-nested — the
 * same regex as splitCommunitySpoilerSegments) delimits spoilers. This module
 * mirrors that grammar as a marked inline extension so spoilers keep their
 * inline flow inside paragraphs instead of being split into blocks.
 *
 * Haven intentionally follows mobile's opinionated underscore grammar:
 * `_text_` and legacy `__text__` are underline, `*text*` is italic, and
 * `**text**` is bold. The underline extension runs before marked's built-in
 * emphasis tokenizer so those wire forms mean the same thing everywhere.
 */

export type SpoilerToken = {
  type: "spoiler";
  raw: string;
  tokens: Token[];
};

export type UnderlineToken = {
  type: "underline";
  raw: string;
  tokens: Token[];
};

const spoilerExtension: TokenizerAndRendererExtension = {
  name: "spoiler",
  level: "inline",
  start(src: string) {
    const index = src.indexOf(COMMUNITY_SPOILER_DELIMITER);
    return index < 0 ? undefined : index;
  },
  tokenizer(src: string) {
    // Same lazy non-nested grammar as splitCommunitySpoilerSegments.
    const match = /^\|\|([\s\S]*?)\|\|/.exec(src);
    if (!match) return undefined;
    const token: SpoilerToken = {
      type: "spoiler",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1] ?? ""),
    };
    return token;
  },
};

const underlineExtension: TokenizerAndRendererExtension = {
  name: "underline",
  level: "inline",
  start(src: string) {
    const index = src.indexOf(COMMUNITY_MARKDOWN_FORMATS.underline.opening);
    return index < 0 ? undefined : index;
  },
  tokenizer(src: string) {
    const match = /^(_{1,2})(?=\S)([\s\S]*?\S)\1(?!_)/.exec(src);
    if (!match) return undefined;
    const token: UnderlineToken = {
      type: "underline",
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[2] ?? ""),
    };
    return token;
  },
};

const chatMarked = new Marked({ gfm: true, breaks: true });
chatMarked.use({ extensions: [spoilerExtension, underlineExtension] });

export function lexChatMarkdown(content: string): Token[] {
  return chatMarked.lexer(content);
}
