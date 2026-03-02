// Changed: add shared rich message renderer for mention highlighting and URL linkification across mobile/desktop.
import React from 'react';

export interface MessageContentProps {
  content: string;
  currentUserDisplayName?: string | null;
}

const MENTION_REGEX = /(@\w[\w.-]{0,30})/g;
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function MessageContent({ content, currentUserDisplayName }: MessageContentProps) {
  const userHandle = currentUserDisplayName?.trim().toLowerCase();
  const segments = content.split(URL_REGEX);

  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((segment, segmentIndex) => {
        if (/^https?:\/\//.test(segment)) {
          const label = segment.length > 42 ? `${segment.slice(0, 39)}…` : segment;
          return (
            <a
              key={`url-${segmentIndex}`}
              href={segment}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 underline"
            >
              {label}
            </a>
          );
        }

        return segment.split(MENTION_REGEX).map((part, mentionIndex) => {
          if (!part.startsWith('@')) {
            return <React.Fragment key={`text-${segmentIndex}-${mentionIndex}`}>{part}</React.Fragment>;
          }

          const isSelf = userHandle && part.slice(1).toLowerCase() === userHandle;
          return (
            <mark
              key={`mention-${segmentIndex}-${mentionIndex}`}
              className={`rounded px-0.5 not-italic font-medium ${
                isSelf ? 'bg-yellow-400/20 text-yellow-300' : 'bg-blue-500/25 text-blue-300'
              }`}
            >
              {part}
            </mark>
          );
        });
      })}
    </span>
  );
}
