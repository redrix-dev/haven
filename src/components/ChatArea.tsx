import React from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Database } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Headphones } from 'lucide-react';
import type {
  BanEligibleServer,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
} from '@/lib/backend/types';

type Message = Database['public']['Tables']['messages']['Row'];
type ChannelKind = Database['public']['Enums']['channel_kind'];
type AuthorProfile = {
  username: string;
  isPlatformStaff: boolean;
  displayPrefix: string | null;
  avatarUrl: string | null;
};

interface ChatAreaProps {
  communityId: string;
  channelId: string;
  channelName: string;
  channelKind: ChannelKind;
  currentUserDisplayName: string;
  messages: Message[];
  messageReactions: MessageReaction[];
  messageAttachments: MessageAttachment[];
  messageLinkPreviews: MessageLinkPreview[];
  authorProfiles: Record<string, AuthorProfile>;
  currentUserId: string;
  canSpeakInVoiceChannel: boolean;
  canManageMessages: boolean;
  canCreateReports: boolean;
  canManageBans: boolean;
  canRefreshLinkPreviews: boolean;
  showVoiceDiagnostics?: boolean;
  onOpenChannelSettings?: () => void;
  onOpenVoiceControls?: () => void;
  onSendMessage: (
    content: string,
    options?: {
      replyToMessageId?: string;
      mediaFile?: File;
      mediaExpiresInHours?: number;
    }
  ) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  onReportMessage: (input: {
    messageId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) => Promise<void>;
  onRequestMessageLinkPreviewRefresh: (messageId: string) => Promise<void>;
  hasOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onRequestOlderMessages?: () => Promise<void>;
  onSaveAttachment: (attachment: MessageAttachment) => Promise<void>;
  onReportUserProfile: (input: { targetUserId: string; reason: string }) => Promise<void>;
  onBanUserFromServer: (input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) => Promise<void>;
  onResolveBanEligibleServers: (targetUserId: string) => Promise<BanEligibleServer[]>;
  onDirectMessageUser: (targetUserId: string) => void;
  onComposerHeightChange?: (height: number) => void;
  onSendHavenDeveloperMessage?: (
    content: string,
    options?: {
      replyToMessageId?: string;
      mediaFile?: File;
      mediaExpiresInHours?: number;
    }
  ) => Promise<void>;
}

export function ChatArea({
  communityId,
  channelId,
  channelName,
  channelKind,
  currentUserDisplayName,
  messages,
  messageReactions,
  messageAttachments,
  messageLinkPreviews,
  authorProfiles,
  currentUserId,
  canSpeakInVoiceChannel,
  canManageMessages,
  canCreateReports,
  canManageBans,
  canRefreshLinkPreviews,
  showVoiceDiagnostics = false,
  onOpenChannelSettings,
  onOpenVoiceControls,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleMessageReaction,
  onReportMessage,
  onRequestMessageLinkPreviewRefresh,
  hasOlderMessages = false,
  isLoadingOlderMessages = false,
  onRequestOlderMessages,
  onSaveAttachment,
  onReportUserProfile,
  onBanUserFromServer,
  onResolveBanEligibleServers,
  onDirectMessageUser,
  onComposerHeightChange,
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

  React.useEffect(() => {
    if (!replyTarget) return;
    const replyTargetStillExists = messages.some((message) => message.id === replyTarget.id);
    if (!replyTargetStillExists) {
      setReplyTarget(null);
    }
  }, [messages, replyTarget]);

  React.useEffect(() => {
    if (!onComposerHeightChange) return;
    if (!isVoiceChannel) return;
    onComposerHeightChange(0);
  }, [isVoiceChannel, onComposerHeightChange]);

  const handleSendMessage = React.useCallback(
    async (
      content: string,
      options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
    ) => {
      const replyToMessageId = options?.replyToMessageId?.trim();
      if (!replyToMessageId) {
        await onSendMessage(content, {
          mediaFile: options?.mediaFile,
          mediaExpiresInHours: options?.mediaExpiresInHours,
        });
        return;
      }

      const replyTargetStillExists = messages.some((message) => message.id === replyToMessageId);
      await onSendMessage(
        content,
        replyTargetStillExists
          ? {
              replyToMessageId,
              mediaFile: options?.mediaFile,
              mediaExpiresInHours: options?.mediaExpiresInHours,
            }
          : {
              mediaFile: options?.mediaFile,
              mediaExpiresInHours: options?.mediaExpiresInHours,
            }
      );

      if (!replyTargetStillExists) {
        setReplyTarget(null);
      }
    },
    [messages, onSendMessage]
  );

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col bg-[#111a2b]">
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
            channelId={channelId}
            messages={messages}
            messageReactions={messageReactions}
            messageAttachments={messageAttachments}
            messageLinkPreviews={messageLinkPreviews}
            authorProfiles={authorProfiles}
            currentUserId={currentUserId}
            canManageMessages={canManageMessages}
            canCreateReports={canCreateReports}
            canManageBans={canManageBans}
            canRefreshLinkPreviews={canRefreshLinkPreviews}
            onSaveAttachment={onSaveAttachment}
            onReportUserProfile={onReportUserProfile}
            onBanUserFromServer={onBanUserFromServer}
            onResolveBanEligibleServers={onResolveBanEligibleServers}
            onDirectMessageUser={onDirectMessageUser}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
            onToggleMessageReaction={onToggleMessageReaction}
            onReplyToMessage={setReplyTarget}
            onReportMessage={onReportMessage}
            onRequestMessageLinkPreviewRefresh={onRequestMessageLinkPreviewRefresh}
            hasOlderMessages={hasOlderMessages}
            isLoadingOlderMessages={isLoadingOlderMessages}
            onRequestOlderMessages={onRequestOlderMessages}
          />

          {/* Input */}
          <MessageInput
            onSendMessage={handleSendMessage}
            onSendHavenDeveloperMessage={onSendHavenDeveloperMessage}
            channelId={channelId}
            channelName={channelName}
            replyTarget={replyTarget}
            onClearReplyTarget={() => setReplyTarget(null)}
            onContainerHeightChange={onComposerHeightChange}
          />
        </>
      )}
    </div>
  );
}

