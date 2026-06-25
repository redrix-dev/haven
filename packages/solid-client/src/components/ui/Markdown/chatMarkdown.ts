import { Marked, type Token, type TokenizerAndRendererExtension } from "marked";
import { COMMUNITY_SPOILER_DELIMITER } from "@shared/features/messaging/utils/communityMarkdownParity";

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
 * Known divergence from mobile (md4c underline flag): `__text__` renders bold
 * here, underline there. Cosmetic; revisit with a tokenizer extension if it
 * starts to matter.
 */

export type SpoilerToken = {
  type: "spoiler";
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

const chatMarked = new Marked({ gfm: true, breaks: true });
chatMarked.use({ extensions: [spoilerExtension] });

export function lexChatMarkdown(content: string): Token[] {
  return chatMarked.lexer(content);
}
