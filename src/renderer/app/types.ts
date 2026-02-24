import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from '@/lib/backend/types';

export type VoiceSidebarParticipant = {
  userId: string;
  displayName: string;
};

export type VoicePresenceStateRow = {
  user_id?: string | null;
  display_name?: string | null;
  joined_at?: string | null;
};

export type ChannelMessageBundleCacheEntry = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
  hasOlderMessages: boolean;
};

export type FriendsPanelTab = 'friends' | 'add' | 'requests' | 'blocked';

export type PendingUiConfirmation =
  | {
      kind: 'leave-server';
      communityId: string;
      serverName: string;
    }
  | {
      kind: 'delete-server';
      communityId: string;
      serverName: string;
    }
  | {
      kind: 'delete-channel';
      channelId: string;
      channelName: string;
    }
  | {
      kind: 'delete-channel-group';
      groupId: string;
      groupName: string;
    };
