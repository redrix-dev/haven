export type ChatMarkdownStyleColors = {
  textColor: string;
  codeBackgroundColor: string;
  blockquoteBorderColor: string;
  linkColor: string;
};

export const CHAT_MARKDOWN_TYPOGRAPHY = {
  paragraph: { fontSize: 16, lineHeight: 24 },
  h1: { fontSize: 24, lineHeight: 32 },
  h2: { fontSize: 20, lineHeight: 28 },
  h3: { fontSize: 18, lineHeight: 26 },
  code: { fontSize: 15, lineHeight: 22 },
} as const;

export const CHAT_COMPOSER_INPUT_STYLE = {
  minHeight: 48,
  maxHeight: 184,
  paddingHorizontal: 16,
  paddingTop: 12,
  paddingBottom: 12,
  fontSize: 17,
  lineHeight: 24,
  backgroundColor: "transparent",
} as const;

export function createChatMarkdownStyle({
  textColor,
  codeBackgroundColor,
  blockquoteBorderColor,
  linkColor,
}: ChatMarkdownStyleColors) {
  return {
    paragraph: {
      color: textColor,
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.paragraph.fontSize,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.paragraph.lineHeight,
    },
    h1: {
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.h1.fontSize,
      fontWeight: "700",
      color: textColor,
      marginTop: 6,
      marginBottom: 6,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.h1.lineHeight,
    },
    h2: {
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.h2.fontSize,
      fontWeight: "700",
      color: textColor,
      marginTop: 6,
      marginBottom: 4,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.h2.lineHeight,
    },
    h3: {
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.h3.fontSize,
      fontWeight: "600",
      color: textColor,
      marginTop: 4,
      marginBottom: 3,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.h3.lineHeight,
    },
    strong: { color: textColor },
    em: { color: textColor },
    code: {
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.code.fontSize,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.code.lineHeight,
      backgroundColor: codeBackgroundColor,
      color: textColor,
      borderColor: codeBackgroundColor,
    },
    codeBlock: {
      fontSize: CHAT_MARKDOWN_TYPOGRAPHY.code.fontSize,
      lineHeight: CHAT_MARKDOWN_TYPOGRAPHY.code.lineHeight,
      backgroundColor: codeBackgroundColor,
      color: textColor,
      padding: 10,
      borderRadius: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    blockquote: {
      backgroundColor: codeBackgroundColor,
      borderColor: blockquoteBorderColor,
      borderWidth: 3,
      gapWidth: 10,
      marginTop: 3,
      marginBottom: 3,
    },
    strikethrough: { color: textColor },
    list: { marginTop: 3, marginBottom: 3 },
    link: { color: linkColor, underline: true },
  } as const;
}
