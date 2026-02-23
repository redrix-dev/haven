import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  BlockedUserSummary,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  SocialCounts,
} from './types';

export interface SocialBackend {
  getSocialCounts(): Promise<SocialCounts>;
  listFriends(): Promise<FriendSummary[]>;
  listFriendRequests(): Promise<FriendRequestSummary[]>;
  listBlockedUsers(): Promise<BlockedUserSummary[]>;
  searchUsersForFriendAdd(query: string): Promise<FriendSearchResult[]>;
  sendFriendRequest(username: string): Promise<string>;
  acceptFriendRequest(requestId: string): Promise<string>;
  declineFriendRequest(requestId: string): Promise<boolean>;
  cancelFriendRequest(requestId: string): Promise<boolean>;
  removeFriend(otherUserId: string): Promise<boolean>;
  blockUser(targetUserId: string): Promise<boolean>;
  unblockUser(targetUserId: string): Promise<boolean>;
  subscribeToSocialGraph(userId: string, onChange: (payload?: unknown) => void): RealtimeChannel;
}

type SocialCountsRow = {
  friends_count: number | null;
  incoming_pending_request_count: number | null;
  outgoing_pending_request_count: number | null;
  blocked_user_count: number | null;
};

type FriendRow = {
  friend_user_id: string;
  username: string;
  avatar_url: string | null;
  friendship_created_at: string;
  mutual_community_count: number | null;
  mutual_community_names: string[] | null;
};

type FriendRequestRow = {
  request_id: string;
  direction: 'incoming' | 'outgoing';
  status: FriendRequestSummary['status'];
  sender_user_id: string;
  sender_username: string;
  sender_avatar_url: string | null;
  recipient_user_id: string;
  recipient_username: string;
  recipient_avatar_url: string | null;
  created_at: string;
  mutual_community_count: number | null;
  mutual_community_names: string[] | null;
};

type BlockedUserRow = {
  blocked_user_id: string;
  username: string;
  avatar_url: string | null;
  blocked_at: string;
};

type FriendSearchRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  relationship_state: FriendSearchResult['relationshipState'];
  pending_request_id: string | null;
  mutual_community_count: number | null;
  mutual_community_names: string[] | null;
};

const mapSocialCounts = (row: SocialCountsRow | null): SocialCounts => ({
  friendsCount: Number(row?.friends_count ?? 0),
  incomingPendingRequestCount: Number(row?.incoming_pending_request_count ?? 0),
  outgoingPendingRequestCount: Number(row?.outgoing_pending_request_count ?? 0),
  blockedUserCount: Number(row?.blocked_user_count ?? 0),
});

const mapFriend = (row: FriendRow): FriendSummary => ({
  friendUserId: row.friend_user_id,
  username: row.username,
  avatarUrl: row.avatar_url ?? null,
  friendshipCreatedAt: row.friendship_created_at,
  mutualCommunityCount: Number(row.mutual_community_count ?? 0),
  mutualCommunityNames: Array.isArray(row.mutual_community_names) ? row.mutual_community_names : [],
});

const mapFriendRequest = (row: FriendRequestRow): FriendRequestSummary => ({
  requestId: row.request_id,
  direction: row.direction,
  status: row.status,
  senderUserId: row.sender_user_id,
  senderUsername: row.sender_username,
  senderAvatarUrl: row.sender_avatar_url ?? null,
  recipientUserId: row.recipient_user_id,
  recipientUsername: row.recipient_username,
  recipientAvatarUrl: row.recipient_avatar_url ?? null,
  createdAt: row.created_at,
  mutualCommunityCount: Number(row.mutual_community_count ?? 0),
  mutualCommunityNames: Array.isArray(row.mutual_community_names) ? row.mutual_community_names : [],
});

const mapBlockedUser = (row: BlockedUserRow): BlockedUserSummary => ({
  blockedUserId: row.blocked_user_id,
  username: row.username,
  avatarUrl: row.avatar_url ?? null,
  blockedAt: row.blocked_at,
});

const mapFriendSearchResult = (row: FriendSearchRow): FriendSearchResult => ({
  userId: row.user_id,
  username: row.username,
  avatarUrl: row.avatar_url ?? null,
  relationshipState: row.relationship_state,
  pendingRequestId: row.pending_request_id ?? null,
  mutualCommunityCount: Number(row.mutual_community_count ?? 0),
  mutualCommunityNames: Array.isArray(row.mutual_community_names) ? row.mutual_community_names : [],
});

const callBooleanRpc = async (functionName: string, args: Record<string, unknown>): Promise<boolean> => {
  const { data, error } = await supabase.rpc(functionName as never, args as never);
  if (error) throw error;
  return Boolean(data);
};

export const centralSocialBackend: SocialBackend = {
  async getSocialCounts() {
    const { data, error } = await supabase.rpc('get_my_social_counts' as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : null) as SocialCountsRow | null;
    return mapSocialCounts(row);
  },

  async listFriends() {
    const { data, error } = await supabase.rpc('list_my_friends' as never);
    if (error) throw error;
    return ((data ?? []) as FriendRow[]).map(mapFriend);
  },

  async listFriendRequests() {
    const { data, error } = await supabase.rpc('list_my_friend_requests' as never);
    if (error) throw error;
    return ((data ?? []) as FriendRequestRow[]).map(mapFriendRequest);
  },

  async listBlockedUsers() {
    const { data, error } = await supabase.rpc('list_my_blocked_users' as never);
    if (error) throw error;
    return ((data ?? []) as BlockedUserRow[]).map(mapBlockedUser);
  },

  async searchUsersForFriendAdd(query) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return [];
    const { data, error } = await supabase.rpc(
      'search_users_for_friend_add' as never,
      { p_query: trimmedQuery } as never
    );
    if (error) throw error;
    return ((data ?? []) as FriendSearchRow[]).map(mapFriendSearchResult);
  },

  async sendFriendRequest(username) {
    const { data, error } = await supabase.rpc(
      'send_friend_request' as never,
      { p_username: username } as never
    );
    if (error) throw error;
    const requestId = data as unknown;
    if (typeof requestId !== 'string' || requestId.trim().length === 0) {
      throw new Error('Friend request creation returned no id.');
    }
    return requestId;
  },

  async acceptFriendRequest(requestId) {
    const { data, error } = await supabase.rpc(
      'accept_friend_request' as never,
      { p_request_id: requestId } as never
    );
    if (error) throw error;
    const otherUserId = data as unknown;
    if (typeof otherUserId !== 'string' || otherUserId.trim().length === 0) {
      throw new Error('Friend request accept returned no user id.');
    }
    return otherUserId;
  },

  async declineFriendRequest(requestId) {
    return callBooleanRpc('decline_friend_request', { p_request_id: requestId });
  },

  async cancelFriendRequest(requestId) {
    return callBooleanRpc('cancel_friend_request', { p_request_id: requestId });
  },

  async removeFriend(otherUserId) {
    return callBooleanRpc('remove_friend', { p_other_user_id: otherUserId });
  },

  async blockUser(targetUserId) {
    return callBooleanRpc('block_user_social', { p_target_user_id: targetUserId });
  },

  async unblockUser(targetUserId) {
    return callBooleanRpc('unblock_user_social', { p_target_user_id: targetUserId });
  },

  subscribeToSocialGraph(userId, onChange) {
    return supabase
      .channel(`social_graph:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `sender_user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_low_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_high_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_blocks',
          filter: `blocker_user_id=eq.${userId}`,
        },
        (payload) => onChange(payload)
      )
      .subscribe();
  },
};
