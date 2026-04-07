import React from "react";
import type { Database } from "@shared/types/database";
import type { MessageLinkPreview } from "@shared/lib/backend/types";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export const QUICK_REACTION_EMOJI = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F389}",
] as const;

export type MessageListAuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

export const isAuthorProfileTombstone = (
  authorProfile: MessageListAuthorProfile | undefined,
): boolean =>
  Boolean(
    authorProfile &&
      authorProfile.avatarUrl === null &&
      (authorProfile.username === "Banned User" ||
        authorProfile.username === "Unknown User"),
  );

export const getReplyToMessageId = (message: Message): string | null => {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const replyTo = (metadata as Record<string, unknown>).replyToMessageId;
  return typeof replyTo === "string" && replyTo.trim().length > 0
    ? replyTo
    : null;
};

export const getAuthorLabel = (
  message: Message,
  authorProfile: MessageListAuthorProfile | undefined,
  currentUserId: string,
): string => {
  if (message.author_type === "haven_dev") return "Haven Moderation Team";
  if (message.author_type === "system") return "System";

  const username =
    authorProfile?.username ??
    message.author_user_id?.substring(0, 12) ??
    "Unknown User";
  if (message.author_user_id === currentUserId) return `${username} (You)`;
  return username;
};

export const getAuthorColor = (
  message: Message,
  authorProfile: MessageListAuthorProfile | undefined,
  currentUserId: string,
): string => {
  const isStaffUserMessage =
    message.author_type === "user" && Boolean(authorProfile?.isPlatformStaff);
  const isOwnMessage =
    message.author_type === "user" && message.author_user_id === currentUserId;

  if (message.author_type === "haven_dev") return "#d6a24a";
  if (isOwnMessage) return "#3f79d8";
  if (isStaffUserMessage) return "#59b7ff";
  return "#44b894";
};

const URL_SEGMENT_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

const trimTrailingUrlPunctuation = (
  value: string,
): { url: string; trailing: string } => {
  let end = value.length;
  while (end > 0 && /[.,!?;:]$/.test(value.slice(0, end))) {
    end -= 1;
  }
  return {
    url: value.slice(0, end),
    trailing: value.slice(end),
  };
};

export const renderLinkifiedMessageText = (
  content: string,
): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;
  URL_SEGMENT_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(URL_SEGMENT_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0] ?? "";
    if (start > lastIndex) {
      nodes.push(
        <React.Fragment key={`text-${matchIndex}-${lastIndex}`}>
          {content.slice(lastIndex, start)}
        </React.Fragment>,
      );
    }

    const { url, trailing } = trimTrailingUrlPunctuation(raw);
    if (url.length > 0) {
      nodes.push(
        <a
          key={`link-${matchIndex}-${start}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[#8fc1ff] hover:text-[#b4d6ff] underline break-all"
        >
          {url}
        </a>,
      );
    } else {
      nodes.push(
        <React.Fragment key={`link-fallback-${matchIndex}-${start}`}>
          {raw}
        </React.Fragment>,
      );
    }
    if (trailing) {
      nodes.push(
        <React.Fragment key={`trail-${matchIndex}-${start}`}>
          {trailing}
        </React.Fragment>,
      );
    }

    lastIndex = start + raw.length;
    matchIndex += 1;
  }

  if (lastIndex < content.length) {
    nodes.push(
      <React.Fragment key={`tail-${lastIndex}`}>
        {content.slice(lastIndex)}
      </React.Fragment>,
    );
  }

  return nodes.length > 0 ? nodes : [content];
};

export const messageContainsHttpUrl = (content: string): boolean => {
  URL_SEGMENT_PATTERN.lastIndex = 0;
  return URL_SEGMENT_PATTERN.test(content);
};

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
