import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { RedeemedInvite, ServerInvite, ServerSummary } from './types';

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
  updateUserProfile(input: { userId: string; username: string; avatarUrl: string | null }): Promise<void>;
  listUserCommunities(userId: string): Promise<ServerSummary[]>;
  subscribeToUserCommunities(userId: string, onChange: () => void): RealtimeChannel;
  createCommunity(name: string): Promise<{ id: string }>;
  createCommunityInvite(input: {
    communityId: string;
    maxUses: number | null;
    expiresInHours: number | null;
  }): Promise<ServerInvite>;
  redeemCommunityInvite(code: string): Promise<RedeemedInvite>;
  listActiveCommunityInvites(communityId: string): Promise<ServerInvite[]>;
  revokeCommunityInvite(communityId: string, inviteId: string): Promise<void>;
}

const mapInvite = (invite: any): ServerInvite => ({
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

    return (data ?? [])
      .map((item: any) => item.communities)
      .filter(
        (community): community is ServerSummary =>
          community !== null && community !== undefined
      );
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
