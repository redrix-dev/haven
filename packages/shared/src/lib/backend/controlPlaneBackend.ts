import type { HavenSupabaseClient } from '@shared/lib/createHavenSupabaseClient';
import { listUserCommunitiesWithClient } from '@shared/lib/listUserCommunitiesWithClient';
import type { Database } from '@shared/types/database';
import { getTheme } from '@shared/themes/registry';
import type { ControlPlaneBackend } from './controlPlaneBackend.interface';
import type {
  BanEligibleServer,
  FeatureFlagsSnapshot,
  LiveProfileIdentity,
  RedeemedInvite,
  ServerInvite,
  ServerSummary,
} from './types';

export type { ControlPlaneBackend, PlatformStaffInfo, UserProfileInfo } from './controlPlaneBackend.interface';

type PrivateUserChannelEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const parsePrivateUserBroadcastEvent = (raw: unknown): PrivateUserChannelEvent => {
  const envelope =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const type = typeof envelope.event === 'string' ? envelope.event : '';
  const inner = envelope.payload;
  const recordPayload =
    inner != null && typeof inner === 'object' && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};

  return { type, payload: recordPayload };
};

const PROFILE_AVATAR_BUCKET = 'profile-avatars';
const PROFILE_AVATAR_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
const PROFILE_AVATAR_PUBLIC_PATH_SEGMENT = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;

const getProfileAvatarObjectPathFromUrl = (avatarUrl: string): string | null => {
  try {
    const parsed = new URL(avatarUrl);
    const bucketPathStart = parsed.pathname.indexOf(PROFILE_AVATAR_PUBLIC_PATH_SEGMENT);
    if (bucketPathStart === -1) return null;
    const objectPath = decodeURIComponent(
      parsed.pathname.slice(bucketPathStart + PROFILE_AVATAR_PUBLIC_PATH_SEGMENT.length)
    ).trim();
    return objectPath.length > 0 ? objectPath : null;
  } catch {
    return null;
  }
};

type InviteRecord = Pick<
  Database['public']['Tables']['invites']['Row'],
  'id' | 'code' | 'current_uses' | 'max_uses' | 'expires_at' | 'is_active'
>;

type FeatureFlagRow = {
  flag_key: string;
  enabled: boolean;
};

type ProfileIdentityRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  updated_at: string;
};

export const mapLiveProfileIdentity = (row: ProfileIdentityRow): LiveProfileIdentity => ({
  userId: row.user_id,
  username: row.username,
  avatarUrl: row.avatar_url ?? null,
  updatedAt: row.updated_at,
});

const mapInvite = (invite: InviteRecord): ServerInvite => ({
  id: invite.id,
  code: invite.code,
  currentUses: invite.current_uses,
  maxUses: invite.max_uses,
  expiresAt: invite.expires_at,
  isActive: invite.is_active,
});

export function createControlPlaneBackend(client: HavenSupabaseClient): ControlPlaneBackend {
  const requireAuthenticatedUserId = async (): Promise<string> => {
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error) throw error;
    if (!user?.id) {
      throw new Error('Not authenticated.');
    }

    return user.id;
  };

  const backend: ControlPlaneBackend = {
  async fetchUserProfile(userId) {
    const { data, error } = await client
      .from('profiles')
      .select('username, avatar_url, theme')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
      username: data.username,
      avatarUrl: data.avatar_url,
      theme: getTheme(data.theme ?? 'default').id,
    };
  },

  async fetchPlatformStaff(userId) {
    const { data, error } = await client
      .from('platform_staff')
      .select('is_active, display_prefix')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
      isActive: Boolean(data.is_active),
      displayPrefix: data.display_prefix ?? null,
    };
  },

  subscribeToProfileIdentities(onChange) {
    return client
      .channel('profile_identities')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_identities',
        },
        (payload) => onChange(payload)
      )
      .subscribe();
  },

  async listMyFeatureFlags() {
    const { data, error } = await client.rpc('list_my_feature_flags' as never);
    if (error) throw error;

    const snapshot: FeatureFlagsSnapshot = {};
    for (const row of ((data ?? []) as FeatureFlagRow[])) {
      if (!row?.flag_key) continue;
      snapshot[row.flag_key] = Boolean(row.enabled);
    }
    return snapshot;
  },

  async uploadAvatar(file, options) {
    const byteLength = file instanceof ArrayBuffer ? file.byteLength : file.size;
    if (byteLength > PROFILE_AVATAR_FILE_SIZE_LIMIT) {
      throw new Error('Avatar images must be 5MB or smaller.');
    }

    const contentType =
      options?.contentType ??
      (file instanceof Blob ? file.type || 'image/webp' : 'image/jpeg');

    const userId = await requireAuthenticatedUserId();
    const objectPath = `${userId}/${Date.now()}.webp`;
    const { error: uploadError } = await client.storage
      .from(PROFILE_AVATAR_BUCKET)
      .upload(objectPath, file, {
        cacheControl: '3600',
        contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = client.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(objectPath);
    if (!data.publicUrl) {
      throw new Error('Failed to resolve avatar URL.');
    }

    return data.publicUrl;
  },

  async deleteAvatar(avatarUrl) {
    const objectPath = getProfileAvatarObjectPathFromUrl(avatarUrl);
    if (!objectPath) return;

    try {
      await client.storage.from(PROFILE_AVATAR_BUCKET).remove([objectPath]);
    } catch {
      // Intentionally ignore avatar cleanup failures during profile updates.
    }
  },

  async updateUserProfile({
    userId,
    username,
    avatarUrl,
    avatarFile = null,
    avatarContentType,
    theme,
  }) {
    const { data: existingProfile, error: existingProfileError } = await client
      .from('profiles')
      .select('avatar_url, theme')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    const priorThemeId = getTheme(existingProfile?.theme ?? 'default').id;

    const existingAvatarUrl = existingProfile?.avatar_url ?? null;
    let nextAvatarUrl = avatarUrl;

    if (avatarFile) {
      if (existingAvatarUrl) {
        await backend.deleteAvatar(existingAvatarUrl);
      }
      const uploadOpts =
        avatarFile instanceof ArrayBuffer
          ? { contentType: avatarContentType ?? 'image/jpeg' }
          : undefined;
      nextAvatarUrl = await backend.uploadAvatar(avatarFile, uploadOpts);
    } else if (avatarUrl === null && existingAvatarUrl) {
      await backend.deleteAvatar(existingAvatarUrl);
    }

    const updatePayload: {
      username: string;
      avatar_url: string | null;
      theme?: string;
    } = {
      username,
      avatar_url: nextAvatarUrl,
    };
    if (theme !== undefined) {
      updatePayload.theme = getTheme(theme).id;
    }

    const { error } = await client.from('profiles').update(updatePayload).eq('id', userId);

    if (error) throw error;

    const effectiveThemeId = theme !== undefined ? getTheme(theme).id : priorThemeId;

    return {
      username,
      avatarUrl: nextAvatarUrl,
      theme: effectiveThemeId,
    };
  },

  async listUserCommunities(userId) {
    return listUserCommunitiesWithClient(client, userId);
  },

  async renameCommunity({ communityId, name }) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Server name is required.');
    }

    const { error } = await client
      .from('communities')
      .update({ name: normalizedName })
      .eq('id', communityId);
    if (error) throw error;
  },

  async deleteCommunity(communityId) {
    const { error } = await client.from('communities').delete().eq('id', communityId);
    if (error) throw error;
  },

  async leaveCommunity(communityId) {
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('Not authenticated.');

    const { data: membership, error: membershipError } = await client
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

    const { error } = await client
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', user.id);
    if (error) throw error;
  },

  subscribeToUserCommunities(userId, onChange) {
    return client
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

  subscribeToPrivateUserChannel(userId, onEvent) {
    const channelName = `private_user:${userId}`;
    let cancelled = false;
    let channel: ReturnType<typeof client.channel> | null = null;

    const {
      data: { subscription: authSubscription },
    } = client.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) {
        await client.realtime.setAuth(session?.access_token ?? '');
      }
    });

    void (async () => {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (cancelled) return;

      await client.realtime.setAuth(session?.access_token ?? '');
      if (cancelled) return;

      channel = client.channel(channelName, {
        config: { private: true },
      });

      channel
        .on('broadcast', { event: '*' }, (payload: unknown) => {
          const parsed = parsePrivateUserBroadcastEvent(payload);
          if (!parsed.type) {
            console.warn(
              '[private_user_channel] broadcast missing event name',
              payload,
            );
            return;
          }
          onEvent(parsed);
        })
        .subscribe((status) => {
          console.log('[private_user_channel] status:', status, channelName);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              `${channelName} did not reach SUBSCRIBED (status: ${status})`,
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      if (channel) void client.removeChannel(channel);
    };
  },

  async createCommunity(name) {
    const { data, error } = await client.rpc('create_community', {
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
    const { data, error } = await client.rpc('create_community_invite', {
      p_community_id: communityId,
      p_max_uses: maxUses ?? undefined,
      p_expires_in_hours: expiresInHours ?? undefined,
    });

    if (error) throw error;
    if (!data) throw new Error('Failed to create invite.');
    return mapInvite(data);
  },

  async redeemCommunityInvite(code) {
    const { data, error } = await client.rpc('redeem_community_invite', {
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
    const { data, error } = await client.rpc('list_bannable_shared_communities', {
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      communityId: row.community_id,
      communityName: row.community_name,
    }));
  },

  async listActiveCommunityInvites(communityId) {
    const { data, error } = await client
      .from('invites')
      .select('id, code, current_uses, max_uses, expires_at, is_active')
      .eq('community_id', communityId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map(mapInvite);
  },

  async revokeCommunityInvite(communityId, inviteId) {
    const { error } = await client
      .from('invites')
      .update({ is_active: false })
      .eq('community_id', communityId)
      .eq('id', inviteId);

    if (error) throw error;
  },
};

  return backend;
}

