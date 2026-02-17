import React from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { VoiceChannelPane } from './VoiceChannelPane';
import { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Headphones } from 'lucide-react';

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
  accessToken?: string | null;
  canSpeakInVoiceChannel: boolean;
  showVoiceDiagnostics?: boolean;
  onOpenChannelSettings?: () => void;
  onSendMessage: (content: string) => Promise<void>;
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
  accessToken = null,
  canSpeakInVoiceChannel,
  showVoiceDiagnostics = false,
  onOpenChannelSettings,
  onSendMessage,
  onSendHavenDeveloperMessage,
}: ChatAreaProps) {
  const isVoiceChannel = channelKind === 'voice';

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
        <VoiceChannelPane
          communityId={communityId}
          channelId={channelId}
          channelName={channelName}
          currentUserId={currentUserId}
          currentUserDisplayName={currentUserDisplayName}
          canSpeak={canSpeakInVoiceChannel}
          showDiagnostics={showVoiceDiagnostics}
          accessToken={accessToken}
        />
      ) : (
        <>
          {/* Messages */}
          <MessageList
            messages={messages}
            authorProfiles={authorProfiles}
            currentUserId={currentUserId}
          />

          {/* Input */}
          <MessageInput
            onSendMessage={onSendMessage}
            onSendHavenDeveloperMessage={onSendHavenDeveloperMessage}
            channelName={channelName}
          />
        </>
      )}
    </div>
  );
}

