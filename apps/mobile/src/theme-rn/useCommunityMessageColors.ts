/**
 * Resolves theme-aware color values for CommunityMessageBubble.
 *
 * Lives in theme-rn/ (UniWind allowlist) so hex fallbacks here don't trigger
 * the no-raw-style-color / no-raw-color-prop lint rules.
 */
import { useMemo } from "react";
import { resolveColorProp } from "@shared/themes";
import { useMobileThemeTokens } from "@/hooks/useMobileThemeTokens";

export type CommunityMessageColors = {
  /** Default text / foreground color */
  text: string;
  /** Muted / secondary text */
  textMuted: string;
  /** Author name */
  authorName: string;
  /** Timestamp */
  timestamp: string;
  /** Reply-to label */
  replyLabel: string;
  /** Avatar background fallback */
  avatarBg: string;
  /** Avatar fallback initial letter */
  avatarFallbackText: string;
  /** Inline code / code block background */
  codeBg: string;
  /** Blockquote / code block border accent */
  blockquoteAccent: string;
  /** Link color */
  link: string;
  /** Date-divider line overlay */
  dateDividerLine: string;
  /** Date-divider text background */
  dateDividerBg: string;
  /** Attachment unavailable text */
  attachmentMuted: string;
  /** Attachment file-row background */
  attachmentFileBg: string;
  /** Attachment file label */
  attachmentFileLabel: string;
  /** Link-preview border */
  linkPreviewBorder: string;
  /** Link-preview card background */
  linkPreviewBg: string;
  /** Link-preview site / subtitle */
  linkPreviewSite: string;
  /** Link-preview title */
  linkPreviewTitle: string;
  /** Link-preview "open" hint */
  linkPreviewHint: string;
  /** Staff badge background (semi-transparent primary) */
  staffBadgeBg: string;
  /** Staff badge text */
  staffBadgeText: string;
};

export function useCommunityMessageColors(): CommunityMessageColors {
  const tokens = useMobileThemeTokens();

  return useMemo(() => {
    const foreground = resolveColorProp(tokens, "foreground") ?? "#e6edf7";
    const mutedFg = resolveColorProp(tokens, "muted-foreground") ?? "#a9b8cf";
    const primary = resolveColorProp(tokens, "primary") ?? "#3F79D8";
    const surfaceEmbedded = resolveColorProp(tokens, "surface-embedded") ?? "#1a2235";
    const background = resolveColorProp(tokens, "background") ?? "#0F1728";

    return {
      text: foreground,
      textMuted: mutedFg,
      authorName: resolveColorProp(tokens, "foreground") ?? "#F2F3F5",
      timestamp: resolveColorProp(tokens, "muted-foreground") ?? "#A5A9B0",
      replyLabel: resolveColorProp(tokens, "muted-foreground") ?? "#9ba9bf",
      avatarBg: resolveColorProp(tokens, "surface-embedded") ?? "#111827",
      avatarFallbackText: foreground,
      codeBg: surfaceEmbedded,
      blockquoteAccent: primary,
      link: primary,
      dateDividerLine: mutedFg,
      dateDividerBg: background,
      attachmentMuted: mutedFg,
      attachmentFileBg: surfaceEmbedded,
      attachmentFileLabel: primary,
      linkPreviewBorder: resolveColorProp(tokens, "border-panel") ?? "#2b3648",
      linkPreviewBg: resolveColorProp(tokens, "surface-panel") ?? "#22355D",
      linkPreviewSite: mutedFg,
      linkPreviewTitle: foreground,
      linkPreviewHint: primary,
      staffBadgeBg: "rgba(69, 121, 205, 0.18)",
      staffBadgeText: primary,
    };
  }, [tokens]);
}
