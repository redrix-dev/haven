import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  BanEligibleServer,
  FeatureFlagsSnapshot,
  RedeemedInvite,
  ServerInvite,
  ServerSummary,
} from './types';

export type PlatformStaffInfo = {
  isActive: boolean;
  displayPrefix: string | null;
};

export type UserProfileInfo = {
  username: string;
  avatarUrl: string | null;
  /** Normalized theme id (see `getTheme`). */
  theme: string;
};

export interface ControlPlaneBackend {
  fetchUserProfile(userId: string): Promise<UserProfileInfo | null>;
  fetchPlatformStaff(userId: string): Promise<PlatformStaffInfo | null>;
  subscribeToProfileIdentities(onChange: (payload?: unknown) => void): RealtimeChannel;
  listMyFeatureFlags(): Promise<FeatureFlagsSnapshot>;
  /** Pass `ArrayBuffer` on React Native; `Blob`/`File` on web (see Supabase RN upload guidance). */
  uploadAvatar(
    file: Blob | ArrayBuffer,
    options?: { contentType?: string },
  ): Promise<string>;
  deleteAvatar(avatarUrl: string): Promise<void>;
  updateUserProfile(input: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    avatarFile?: Blob | ArrayBuffer | null;
    /** Required when `avatarFile` is an `ArrayBuffer` (e.g. mobile); ignored for `Blob`. */
    avatarContentType?: string;
    /** When set, updates `profiles.theme` (normalized via `getTheme`). */
    theme?: string;
  }): Promise<UserProfileInfo>;
  listUserCommunities(userId: string): Promise<ServerSummary[]>;
  renameCommunity(input: { communityId: string; name: string }): Promise<void>;
  deleteCommunity(communityId: string): Promise<void>;
  leaveCommunity(communityId: string): Promise<void>;
  subscribeToUserCommunities(
    userId: string,
    onChange: () => void,
  ): RealtimeChannel;
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
  subscribeToPrivateUserChannel(
    userId: string,
    onEvent: (event: { type: string; payload: Record<string, unknown> }) => void,
  ): () => void;
}
