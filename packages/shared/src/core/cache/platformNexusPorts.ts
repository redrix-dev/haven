import type { HavenBackends } from "@shared/core/backends";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import type { ViewerMessagePolicyStore } from "@shared/core/viewerMessagePolicy";
import type {
  PlatformStaffInfo,
  UserProfileInfo,
} from "@shared/lib/backend/controlPlaneBackend.interface";
import type { CommunityDataBackend } from "@shared/lib/backend/communityDataBackend.interface";
import type {
  BlockedUserSummary,
  ChannelAccessRevokedResult,
  ChannelKind,
  ChannelPermissionState,
  FeatureFlagsSnapshot,
  FriendRequestSummary,
  FriendSearchResult,
  FriendSummary,
  LiveProfileIdentity,
  OnboardingCampaign,
  OnboardingClientContext,
  OnboardingCompletionResult,
  ProfileVisibility,
  ReportStatusUpdatedBroadcastPayload,
  ServerInvite,
  ServerPermissions,
  ServerReportDetail,
  ServerReportSummary,
  ServerRoleItem,
  ServerSettingsUpdate,
  SocialCounts,
  SupportReportStatus,
  UserFlairGrant,
  UserProfileCard,
} from "@shared/lib/backend/types";
import type { VoiceTokenResponse } from "@shared/lib/backend/voiceTokenBackend";
import type {
  VoiceConnectionPhase,
  VoiceKickPayload,
  VoiceRealtimeChannel,
  VoiceRealtimeTransport,
} from "@shared/features/voice/types";
import type { VoiceNexusState, VoiceSessionSnapshot } from "@shared/features/voice/voiceNexusTypes";
import type { VoiceChannelReference, VoiceSidebarParticipant } from "@shared/types/types";
import type {
  CommunityAdminChannelPermissionsState,
  CommunityAdminMembersModalState,
  CommunityAdminServerPanelState,
} from "@shared/nexus/community/communityAdminTypes";

export type { VoiceRealtimeChannel, VoiceRealtimeTransport };
export type {
  CommunityAdminChannelPermissionsState,
  CommunityAdminMembersModalState,
  CommunityAdminNexusState,
  CommunityAdminServerPanelState,
} from "@shared/nexus/community/communityAdminTypes";
export type { VoiceNexusState, VoiceSessionSnapshot } from "@shared/features/voice/voiceNexusTypes";

export type PlatformNexusContext = {
  persistence: NexusPersistence;
  backends: HavenBackends;
  viewerMessagePolicyStore: ViewerMessagePolicyStore;
  voiceRealtime: VoiceRealtimeTransport;
};

export type ViewerProfileUpdateInput = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  avatarFile?: Blob | ArrayBuffer | null;
  avatarContentType?: string;
  theme?: string;
  profileVisibility?: ProfileVisibility;
  profileBio?: string | null;
};

export interface CommunityAdminNexusPort {
  clear(): void;
  useMembersModalState(): CommunityAdminMembersModalState;
  useServerPanelState(): CommunityAdminServerPanelState;
  useServerAdminState(): CommunityAdminMembersModalState &
    CommunityAdminServerPanelState;
  useChannelPermissionsState(): CommunityAdminChannelPermissionsState;
  resetMembersModal(): void;
  closeMembersModal(): void;
  resetCommunityBans(): void;
  clearCommunityBansError(): void;
  resetServerInvites(): void;
  clearServerInvitesError(): void;
  resetServerRoleManagement(): void;
  clearServerRoleManagementError(): void;
  resetServerSettingsState(): void;
  clearServerSettingsLoadError(): void;
  resetChannelPermissionsState(): void;
  refreshMembersModalMembers(communityId: string): Promise<void>;
  refreshMembersModalMembersIfOpen(communityId: string): Promise<void>;
  openServerMembersModal(
    communityId: string,
    serverName?: string,
  ): Promise<void>;
  openServerSettingsModal(communityIdOverride?: string): Promise<void>;
  openChannelSettingsModal(channelId?: string): Promise<void>;
  loadCommunityBans(communityId?: string | null): Promise<void>;
  loadServerInvites(communityId?: string | null): Promise<void>;
  loadServerRoleManagement(communityId?: string | null): Promise<void>;
  loadServerSettings(communityId?: string | null): Promise<void>;
  loadChannelPermissions(
    targetChannelId?: string | null,
    communityId?: string | null,
  ): Promise<void>;
  createServerInvite(
    values: { maxUses: number | null; expiresInHours: number | null },
    communityIdOverride?: string | null,
  ): Promise<ServerInvite>;
  saveServerSettings(
    values: ServerSettingsUpdate,
    communityIdOverride?: string | null,
  ): Promise<void>;
  revokeServerInvite(
    inviteId: string,
    communityIdOverride?: string | null,
  ): Promise<void>;
  unbanUserFromCurrentServer(
    input: { targetUserId: string; reason?: string | null },
    communityIdOverride?: string | null,
  ): Promise<void>;
  createServerRole(input: {
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  updateServerRole(input: {
    roleId: string;
    name: string;
    color: string;
    position: number;
  }): Promise<void>;
  reorderServerRoles(
    orderedRoles: ServerRoleItem[],
    communityId?: string | null,
  ): Promise<void>;
  deleteServerRole(roleId: string): Promise<void>;
  saveServerRolePermissions(roleId: string, permissionKeys: string[]): Promise<void>;
  saveServerMemberRoles(memberId: string, roleIds: string[]): Promise<void>;
  banMember(input: {
    communityId: string;
    targetUserId: string;
    reason: string;
  }): Promise<void>;
  kickMember(input: {
    communityId: string;
    targetUserId: string;
  }): Promise<void>;
  reportMember(input: {
    communityId: string;
    targetUserId: string;
    reporterUserId: string;
    reason: string;
  }): Promise<void>;
  leaveServer(communityId: string): Promise<void>;
  deleteServer(communityId: string): Promise<void>;
  renameServer(communityId: string, name: string): Promise<void>;
  createChannel(
    values: { name: string; topic: string | null; kind: ChannelKind },
    communityId?: string | null,
  ): Promise<void>;
  saveChannelSettings(
    values: { name: string; topic: string | null },
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<void>;
  renameChannel(
    channelId: string,
    name: string,
    communityId?: string | null,
  ): Promise<void>;
  deleteChannel(
    channelId: string,
    communityId?: string | null,
  ): Promise<void>;
  deleteCurrentChannel(): Promise<void>;
  saveRoleChannelPermissions(
    roleId: string,
    permissions: ChannelPermissionState,
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<void>;
  saveMemberChannelPermissions(
    memberId: string,
    permissions: ChannelPermissionState,
    communityId?: string | null,
    channelId?: string | null,
  ): Promise<ChannelAccessRevokedResult | null>;
}

export interface CommunityModerationNexusPort {
  load(communityIds: string[]): Promise<void>;
  selectReport(reportId: string): Promise<void>;
  clearSelection(): void;
  updateStatus(reportId: string, status: SupportReportStatus): Promise<void>;
  addNote(reportId: string, body: string): Promise<void>;
  escalate(reportId: string): Promise<string>;
  acknowledge(reportId: string): Promise<void>;
  handleReportChange(payload: ReportStatusUpdatedBroadcastPayload): void;
  handleUserPlatformBanned(userId: string): void;
  useReports(
    serverFilter?: string,
    statusFilter?: SupportReportStatus | "all",
  ): ServerReportSummary[];
  useSelectedReportId(): string | null;
  useDetail(): ServerReportDetail | null;
  useIsLoadingReports(): boolean;
  useIsLoadingDetail(): boolean;
  rehydrate(): void;
  clear(): void;
}

export interface SocialNexusPort {
  setPolicySyncCallback(callback: (() => void) | null): void;
  getHiddenAuthorIdsForViewer(): ReadonlySet<string>;
  load(): Promise<void>;
  ensureLoaded(options?: { freshnessMs?: number }): Promise<void>;
  loadBlockLists(): Promise<void>;
  handleSocialChange(payload: Record<string, unknown>): void;
  blockUser(targetUserId: string): Promise<void>;
  unblockUser(targetUserId: string): Promise<void>;
  sendFriendRequest(username: string): Promise<string>;
  acceptFriendRequest(requestId: string): Promise<void>;
  declineFriendRequest(requestId: string): Promise<void>;
  cancelFriendRequest(requestId: string): Promise<void>;
  removeFriend(otherUserId: string): Promise<void>;
  searchUsers(query: string): Promise<FriendSearchResult[]>;
  useCounts(): SocialCounts;
  useFriends(): FriendSummary[];
  useRequests(): FriendRequestSummary[];
  useFriendRequests(): FriendRequestSummary[];
  useBlockedUsers(): BlockedUserSummary[];
  useBlockedUserIds(): ReadonlySet<string>;
  useIsLoading(): boolean;
  rehydrate(): void;
  clear(): void;
}

export interface PermissionsNexusPort {
  setPolicySyncCallback(callback: ((communityId: string) => void) | null): void;
  getPermissions(communityId: string): ServerPermissions;
  isElevated(communityId: string): boolean;
  getRevokedAuthorIds(
    communityId: string,
    channelId?: string,
  ): readonly string[];
  getRevokedAuthorIdsByChannel(
    communityId: string,
  ): Readonly<Record<string, readonly string[]>>;
  getPermissionsByCommunityId(): Record<string, ServerPermissions>;
  appendRevokedAuthorId(
    communityId: string,
    channelId: string,
    revokedUserId: string,
  ): void;
  ensureLoaded(communityId: string, communityBackend: CommunityDataBackend): Promise<void>;
  ensureElevated(
    communityId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<boolean>;
  loadRevokedAuthorIdsForChannel(
    communityId: string,
    channelId: string,
    communityBackend: CommunityDataBackend,
  ): Promise<void>;
  invalidate(communityId: string): void;
  usePermissions(communityId: string): ServerPermissions;
  usePermissionsByCommunityId(): Record<string, ServerPermissions>;
  useIsElevated(communityId: string): boolean;
  rehydrate(): void;
  clear(): void;
}

export interface ProfileNexusPort {
  ensureViewerProfile(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserProfileInfo | null>;
  ensurePlatformStaff(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<PlatformStaffInfo | null>;
  loadViewerProfile(userId: string): Promise<UserProfileInfo | null>;
  updateViewerProfile(input: ViewerProfileUpdateInput): Promise<UserProfileInfo>;
  loadMyUserFlairs(userId: string): Promise<UserFlairGrant[]>;
  ensureMyUserFlairs(
    userId: string,
    options?: { freshnessMs?: number },
  ): Promise<UserFlairGrant[]>;
  setActiveUserFlair(
    userId: string,
    userFlairId: string | null,
  ): Promise<void>;
  loadProfileCard(userId: string): Promise<UserProfileCard | null>;
  loadPlatformStaff(userId: string): Promise<PlatformStaffInfo | null>;
  upsertProfile(profile: LiveProfileIdentity): void;
  upsertProfiles(profiles: LiveProfileIdentity[]): void;
  removeProfile(userId: string): void;
  getProfile(userId: string): LiveProfileIdentity | undefined;
  getViewerProfile(userId: string): UserProfileInfo | null | undefined;
  getViewerProfileError(userId: string): string | null;
  getProfileCard(userId: string): UserProfileCard | null | undefined;
  getProfileCardError(userId: string): string | null;
  getUserFlairGrants(userId: string): UserFlairGrant[];
  getUserFlairGrantError(userId: string): string | null;
  getPlatformStaff(userId: string): PlatformStaffInfo | null | undefined;
  getPlatformStaffError(userId: string): string | null;
  useProfile(userId: string | null | undefined): LiveProfileIdentity | undefined;
  useProfilesRecord(): Record<string, LiveProfileIdentity>;
  useProfiles(userIds: readonly string[]): Record<string, LiveProfileIdentity>;
  useViewerProfile(userId: string | null | undefined): UserProfileInfo | null;
  useViewerProfileLoaded(userId: string | null | undefined): boolean;
  useViewerProfileLoading(userId: string | null | undefined): boolean;
  useViewerProfileError(userId: string | null | undefined): string | null;
  useProfileCard(userId: string | null | undefined): UserProfileCard | null;
  useProfileCardLoading(userId: string | null | undefined): boolean;
  useProfileCardError(userId: string | null | undefined): string | null;
  useUserFlairGrants(userId: string | null | undefined): UserFlairGrant[];
  useUserFlairGrantLoading(userId: string | null | undefined): boolean;
  useUserFlairGrantError(userId: string | null | undefined): string | null;
  usePlatformStaff(userId: string | null | undefined): PlatformStaffInfo | null;
  usePlatformStaffLoading(userId: string | null | undefined): boolean;
  usePlatformStaffError(userId: string | null | undefined): string | null;
  rehydrate(): void;
  clear(): void;
}

export interface FeatureFlagNexusPort {
  load(): Promise<FeatureFlagsSnapshot>;
  reset(): void;
  has(flagKey: string): boolean;
  getFlags(): FeatureFlagsSnapshot;
  getLoaded(): boolean;
  getLoading(): boolean;
  getError(): string | null;
  useFlags(): FeatureFlagsSnapshot;
  useLoaded(): boolean;
  useLoading(): boolean;
  useError(): string | null;
  useHasFlag(flagKey: string): boolean;
}

export interface OnboardingNexusPort {
  load(context: OnboardingClientContext): Promise<OnboardingCampaign[]>;
  complete(
    campaignKey: string,
    context: OnboardingClientContext,
  ): Promise<OnboardingCompletionResult>;
  reset(): void;
  getCampaigns(): OnboardingCampaign[];
  getLoaded(): boolean;
  getLoading(): boolean;
  getError(): string | null;
  getCompletingCampaignKey(): string | null;
  getCompletionError(): string | null;
  useCampaigns(): OnboardingCampaign[];
  useLoaded(): boolean;
  useLoading(): boolean;
  useError(): string | null;
  useCompletingCampaignKey(): string | null;
  useCompletionError(): string | null;
}

export interface VoiceNexusPort {
  startConnect(channel: VoiceChannelReference): void;
  markConnected(): void;
  startSwitch(channel: VoiceChannelReference): void;
  startDisconnect(): void;
  completeDisconnect(): void;
  setError(message: string): void;
  clearError(): void;
  setJoined(joined: boolean): void;
  setMuted(isMuted: boolean): void;
  setIsMuted(isMuted: boolean): void;
  setDeafened(isDeafened: boolean): void;
  setIsDeafened(isDeafened: boolean): void;
  setCurrentChannelId(currentChannelId: string | null): void;
  setParticipants(participants: VoiceSidebarParticipant[]): void;
  setChannelParticipants(
    channelId: string,
    participants: VoiceSidebarParticipant[],
  ): void;
  retainChannelParticipants(channelIds: string[]): void;
  setVoiceConnected(voiceConnected: boolean): void;
  setSessionState(sessionState: VoiceSessionSnapshot | null): void;
  fetchJoinCredentials(
    communityId: string,
    channelId: string,
  ): Promise<VoiceTokenResponse>;
  connectKickChannel(input: {
    communityId: string;
    channelId: string;
    currentUserId: string;
    onKick: (payload: VoiceKickPayload) => void;
  }): Promise<void>;
  disconnectKickChannel(): Promise<void>;
  kickParticipant(targetUserId: string, channelId: string): Promise<void>;
  connectPresenceChannel(input: {
    communityId: string;
    channelId: string;
    currentUserId: string;
    displayName: string;
    avatarUrl?: string | null;
  }): Promise<void>;
  disconnectPresenceChannel(): Promise<void>;
  cleanupPresenceChannel(communityId: string, channelId: string): Promise<void>;
  subscribePresenceChannels(input: {
    communityId: string;
    channelIds: string[];
    activeChannelId?: string | null;
  }): () => void;
  useSession(): VoiceNexusState;
  useParticipantsByChannel(): Record<string, VoiceSidebarParticipant[]>;
  useVisibleParticipants(channelId: string): VoiceSidebarParticipant[];
  getSnapshot(): VoiceNexusState;
  getParticipantsByChannelSnapshot(): Record<string, VoiceSidebarParticipant[]>;
  getVisibleParticipantsSnapshot(channelId: string): VoiceSidebarParticipant[];
  rehydrate(): void;
  clear(): void;
}

export type PlatformNexusBundle = {
  admin: CommunityAdminNexusPort;
  moderation: CommunityModerationNexusPort;
  social: SocialNexusPort;
  permissions: PermissionsNexusPort;
  profiles: ProfileNexusPort;
  featureFlags: FeatureFlagNexusPort;
  onboarding: OnboardingNexusPort;
  voice: VoiceNexusPort;
};

export type CreatePlatformNexusBundle = (
  ctx: PlatformNexusContext,
) => PlatformNexusBundle;

export type {
  VoiceConnectionPhase,
  VoiceKickPayload,
} from "@shared/features/voice/types";
