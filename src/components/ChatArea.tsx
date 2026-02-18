import React from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Headphones } from 'lucide-react';
import type { MessageReportKind, MessageReportTarget } from '@/lib/backend/types';

type Message = Database['public']['Tables']['messages']['Row'];
type ChannelKind = Database['public']['Enums']['channel_kind'];
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
};

interface ChatAreaProps {
  communityId: string;
  channelId: string;
  channelName: string;
  channelKind: ChannelKind;
  currentUserDisplayName: string;
  messages: Message[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
  canSpeakInVoiceChannel: boolean;
  canManageMessages: boolean;
  showVoiceDiagnostics?: boolean;
  onOpenChannelSettings?: () => void;
  onOpenVoiceControls?: () => void;
  onSendMessage: (content: string, options?: { replyToMessageId?: string }) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReportMessage: (input: {
    messageId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) => Promise<void>;
  onSendHavenDeveloperMessage?: (content: string) => Promise<void>;
}

export function ChatArea({
  communityId,
  channelId,
  channelName,
  channelKind,
  currentUserDisplayName,
  messages,
  authorProfiles,
  currentUserId,
  canSpeakInVoiceChannel,
  canManageMessages,
  showVoiceDiagnostics = false,
  onOpenChannelSettings,
  onOpenVoiceControls,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onSendHavenDeveloperMessage,
}: ChatAreaProps) {
  const isVoiceChannel = channelKind === 'voice';
  const [replyTarget, setReplyTarget] = React.useState<{
    id: string;
    authorLabel: string;
    preview: string;
  } | null>(null);

  React.useEffect(() => {
    setReplyTarget(null);
  }, [channelId]);

  return (
    <div className="flex-1 flex flex-col bg-[#111a2b]">
      {/* Channel header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#263a58]">
        <span className="text-white font-semibold text-base">
          {isVoiceChannel ? (
            <span className="inline-flex items-center gap-2">
              <Headphones className="size-4" />
              {channelName}
            </span>
          ) : (
            `# ${channelName}`
          )}
        </span>
        {onOpenChannelSettings && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenChannelSettings}
            className="text-[#a9b8cf] hover:text-white hover:bg-[#304867]"
          >
            Channel Settings
          </Button>
        )}
      </div>

      {isVoiceChannel ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <Headphones className="size-7 text-[#8ea4c7]" />
          <p className="text-white font-semibold">Voice channel selected: {channelName}</p>
          <p className="text-sm text-[#a9b8cf] max-w-xl">
            Voice stays connected while you browse text channels. Open voice controls from the sidebar
            panel.
          </p>
          {onOpenVoiceControls && (
            <Button
              type="button"
              onClick={onOpenVoiceControls}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              Open Voice Controls
            </Button>
          )}
          {!canSpeakInVoiceChannel && (
            <p className="text-xs text-[#d6a24a]">
              You can join as listener only in this voice channel.
            </p>
          )}
          {showVoiceDiagnostics && (
            <p className="text-xs text-[#8ea4c7]">
              Staff diagnostics are available in voice controls.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Messages */}
          <MessageList
            messages={messages}
            authorProfiles={authorProfiles}
            currentUserId={currentUserId}
            canManageMessages={canManageMessages}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
            onReplyToMessage={setReplyTarget}
            onReportMessage={onReportMessage}
          />

          {/* Input */}
          <MessageInput
            onSendMessage={onSendMessage}
            onSendHavenDeveloperMessage={onSendHavenDeveloperMessage}
            channelName={channelName}
            replyTarget={replyTarget}
            onClearReplyTarget={() => setReplyTarget(null)}
          />
        </>
      )}
    </div>
  );
}

