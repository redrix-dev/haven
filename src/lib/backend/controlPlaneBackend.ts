import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type {
  BanEligibleServer,
  FeatureFlagsSnapshot,
  RedeemedInvite,
  ServerInvite,
  ServerSummary,
} from './types';

export type PlatformStaffInfo = {
  isActive: boolean;
  canPostHavenDev: boolean;
  displayPrefix: string | null;
};

export type UserProfileInfo = {
  username: string;
  avatarUrl: string | null;
};

export interface ControlPlaneBackend {
  fetchUserProfile(userId: string): Promise<UserProfileInfo | null>;
  fetchPlatformStaff(userId: string): Promise<PlatformStaffInfo | null>;
  listMyFeatureFlags(): Promise<FeatureFlagsSnapshot>;
  updateUserProfile(input: { userId: string; username: string; avatarUrl: string | null }): Promise<void>;
  listUserCommunities(userId: string): Promise<ServerSummary[]>;
  renameCommunity(input: { communityId: string; name: string }): Promise<void>;
  deleteCommunity(communityId: string): Promise<void>;
  leaveCommunity(communityId: string): Promise<void>;
  subscribeToUserCommunities(userId: string, onChange: () => void): RealtimeChannel;
  createCommunity(name: string): Promise<{ id: string }>;
  createCommunityInvite(input: {
    communityId: string;
    maxUses: number | null;
    expiresInHours: number | null;
  }): Promise<ServerInvite>;
  redeemCommunityInvite(code: string): Promise<RedeemedInvite>;
  listBanEligibleServersForUser(targetUserId: string): Promise<BanEligibleServer[]>;
  listActiveCommunityInvites(communityId: string): Promise<ServerInvite[]>;
  revokeCommunityInvite(communityId: string, inviteId: string): Promise<void>;
}

type InviteRecord = Pick<
  Database['public']['Tables']['invites']['Row'],
  'id' | 'code' | 'current_uses' | 'max_uses' | 'expires_at' | 'is_active'
>;

type CommunityMemberCommunityRow = {
  communities: ServerSummary | null;
};

type FeatureFlagRow = {
  flag_key: string;
  enabled: boolean;
};

const mapInvite = (invite: InviteRecord): ServerInvite => ({
  id: invite.id,
  code: invite.code,
  currentUses: invite.current_uses,
  maxUses: invite.max_uses,
  expiresAt: invite.expires_at,
  isActive: invite.is_active,
});

export const centralControlPlaneBackend: ControlPlaneBackend = {
  async fetchUserProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
      username: data.username,
      avatarUrl: data.avatar_url,
    };
  },

  async fetchPlatformStaff(userId) {
    const { data, error } = await supabase
      .from('platform_staff')
      .select('is_active, can_post_haven_dev, display_prefix')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
      isActive: Boolean(data.is_active),
      canPostHavenDev: Boolean(data.can_post_haven_dev),
      displayPrefix: data.display_prefix ?? null,
    };
  },

  async listMyFeatureFlags() {
    const { data, error } = await supabase.rpc('list_my_feature_flags' as never);
    if (error) throw error;

    const snapshot: FeatureFlagsSnapshot = {};
    for (const row of ((data ?? []) as FeatureFlagRow[])) {
      if (!row?.flag_key) continue;
      snapshot[row.flag_key] = Boolean(row.enabled);
    }
    return snapshot;
  },

  async updateUserProfile({ userId, username, avatarUrl }) {
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        avatar_url: avatarUrl,
      })
      .eq('id', userId);

    if (error) throw error;
  },

  async listUserCommunities(userId) {
    const { data, error } = await supabase
      .from('community_members')
      .select('communities(id, name, created_at)')
      .eq('user_id', userId);

    if (error) throw error;

    return ((data ?? []) as CommunityMemberCommunityRow[])
      .map((item) => item.communities)
      .filter(
        (community): community is ServerSummary =>
          community !== null && community !== undefined
      );
  },

  async renameCommunity({ communityId, name }) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Server name is required.');
    }

    const { error } = await supabase
      .from('communities')
      .update({ name: normalizedName })
      .eq('id', communityId);
    if (error) throw error;
  },

  async deleteCommunity(communityId) {
    const { error } = await supabase.from('communities').delete().eq('id', communityId);
    if (error) throw error;
  },

  async leaveCommunity(communityId) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { data: membership, error: membershipError } = await supabase
      .from('community_members')
      .select('is_owner')
      .eq('community_id', communityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error('You are not a member of this server.');
    if (membership.is_owner) {
      throw new Error('Owners cannot leave a server. Delete the server instead.');
    }

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribeToUserCommunities(userId, onChange) {
    return supabase
      .channel(`community_members_changes:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_members',
          filter: `user_id=eq.${userId}`,
        },
        onChange
      )
      .subscribe();
  },

  async createCommunity(name) {
    const { data, error } = await supabase.rpc('create_community', {
      p_name: name,
      // Supabase generated RPC types use `undefined` for optional args.
      p_description: undefined,
    });

    if (error) throw error;
    if (!data?.id) {
      throw new Error('Failed to create community.');
    }

    return { id: data.id };
  },

  async createCommunityInvite({ communityId, maxUses, expiresInHours }) {
    const { data, error } = await supabase.rpc('create_community_invite', {
      p_community_id: communityId,
      p_max_uses: maxUses ?? undefined,
      p_expires_in_hours: expiresInHours ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error('Failed to create invite.');
    return mapInvite(data);
  },

  async redeemCommunityInvite(code) {
    const { data, error } = await supabase.rpc('redeem_community_invite', {
      p_code: code,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;

    if (!row?.community_id) {
      throw new Error('Invite redemption returned no community.');
    }

    return {
      communityId: row.community_id,
      communityName: row.community_name,
      joined: row.joined,
    };
  },

  async listBanEligibleServersForUser(targetUserId) {
    if (!targetUserId) return [];
    const { data, error } = await supabase.rpc('list_bannable_shared_communities', {
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      communityId: row.community_id,
      communityName: row.community_name,
    }));
  },

  async listActiveCommunityInvites(communityId) {
    const { data, error } = await supabase
      .from('invites')
      .select('id, code, current_uses, max_uses, expires_at, is_active')
      .eq('community_id', communityId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(mapInvite);
  },

  async revokeCommunityInvite(communityId, inviteId) {
    const { error } = await supabase
      .from('invites')
      .update({ is_active: false })
      .eq('community_id', communityId)
      .eq('id', inviteId);

    if (error) throw error;
  },
};
