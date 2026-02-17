import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database } from '@/types/database';

type Message = Database['public']['Tables']['messages']['Row'];
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
};

interface MessageListProps {
  messages: Message[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
}

export function MessageList({ messages, authorProfiles, currentUserId }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ScrollArea className="flex-1 p-4">
      <div ref={scrollRef} className="space-y-4">
        {messages.map((msg) => {
          const authorProfile = msg.author_user_id ? authorProfiles[msg.author_user_id] : undefined;
          const isStaffUserMessage = msg.author_type === 'user' && Boolean(authorProfile?.isPlatformStaff);
          const isOwnMessage = msg.author_type === 'user' && msg.author_user_id === currentUserId;
          const userColor =
            msg.author_type === 'haven_dev'
              ? '#d6a24a'
              : isOwnMessage
                ? '#3f79d8'
                : isStaffUserMessage
                  ? '#59b7ff'
                  : '#44b894';
          const authorLabel =
            msg.author_type === 'haven_dev'
              ? 'Haven Developer'
              : msg.author_type === 'system'
                ? 'System'
                : (() => {
                    const username =
                      authorProfile?.username ?? msg.author_user_id?.substring(0, 12) ?? 'Unknown User';
                    if (authorProfile?.isPlatformStaff) {
                      return `${authorProfile.displayPrefix ?? 'Haven'}-${username}`;
                    }
                    return username;
                  })();

          return (
            <div key={msg.id} className="group">
              <div className="flex items-baseline gap-2 mb-1">
                <span 
                  className="font-semibold text-[15px]"
                  style={{ color: userColor }}
                >
                  {authorLabel}
                </span>
                {isStaffUserMessage && (
                  <span className="px-1.5 py-0.5 rounded bg-[#59b7ff]/20 text-[#9cd6ff] text-[10px] font-semibold uppercase tracking-wide">
                    Staff
                  </span>
                )}
                <span className="text-xs text-[#8897b1]">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
              <div className="text-[#e6edf7] text-[15px] leading-[1.375]">
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

