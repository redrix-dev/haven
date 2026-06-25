import type {
  Message,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
} from "@shared/lib/backend/types";

export type VoiceSidebarParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  isSpeaking?: boolean;
};

export type VoiceChannelReference = {
  id: string;
  name: string;
  community_id: string;
};

export type VoicePresenceStateRow = {
  user_id?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  is_speaking?: boolean | null;
  joined_at?: string | null;
};

export type ChannelMessageBundleSyncMetadata = {
  /** ISO timestamp of last successful HTTP sync for this bundle. */
  lastSuccessfulSyncAt: string;
  /** Newest message in the merged timeline (ascending list tail). */
  newestMessageCursor: { createdAt: string; id: string } | null;
};

export type ChannelMessageBundleCacheEntry = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
  hasOlderMessages: boolean;
  /** Present after a successful load / prefetch / soft revalidate. */
  syncMetadata?: ChannelMessageBundleSyncMetadata;
};

export type FriendsPanelTab = "friends" | "add" | "requests" | "blocked";

export type PendingUiConfirmation =
  | {
      kind: "leave-server";
      communityId: string;
      serverName: string;
    }
  | {
      kind: "delete-server";
      communityId: string;
      serverName: string;
    }
  | {
      kind: "delete-channel";
      channelId: string;
      channelName: string;
    }
  | {
      kind: "delete-channel-group";
      groupId: string;
      groupName: string;
    };
