import type { MessageLinkPreview } from "@shared/lib/backend/types";

export const extractYoutubeVideoId = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[a-zA-Z0-9_-]{6,20}$/.test(fromQuery))
        return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "embed" || parts[0] === "shorts") &&
        /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1] ?? "")
      ) {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
};

export const extractVimeoVideoId = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().endsWith("vimeo.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (/^\d{6,15}$/.test(parts[index])) return parts[index];
    }
  } catch {
    return null;
  }

  return null;
};

export const getFallbackEmbedUrl = (
  preview: MessageLinkPreview,
): string | null => {
  const embed = preview.snapshot?.embed;
  if (!embed) return null;

  const candidateSourceUrls = [
    preview.snapshot?.canonicalUrl,
    preview.snapshot?.finalUrl,
    preview.snapshot?.sourceUrl,
    preview.sourceUrl,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  if (embed.provider === "youtube") {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractYoutubeVideoId(rawUrl);
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    return null;
  }

  if (embed.provider === "vimeo") {
    for (const rawUrl of candidateSourceUrls) {
      const videoId = extractVimeoVideoId(rawUrl);
      if (videoId) return `https://player.vimeo.com/video/${videoId}`;
    }
  }

  return null;
};
