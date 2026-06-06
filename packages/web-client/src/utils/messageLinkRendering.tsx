import React from "react";
import type { Database } from "@shared/types/database";
import type { MessageListAuthorProfile } from "@shared/features/profile/utils/profileTombstone";

type Message = Database["public"]["Tables"]["messages"]["Row"];

export const QUICK_REACTION_EMOJI = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F389}",
] as const;

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

  if (message.author_type === "haven_dev") return "var(--accent-amber)";
  if (isOwnMessage) return "var(--primary)";
  if (isStaffUserMessage) return "var(--link)";
  return "var(--status-online)";
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
          className="text-info hover:text-link-soft underline break-all"
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
