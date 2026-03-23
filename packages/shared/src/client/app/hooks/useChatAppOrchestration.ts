import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@shared/contexts/AuthContext';
import { useServers } from '@shared/lib/hooks/useServers';
import {
  getCommunityDataBackend,
  getControlPlaneBackend,
  getDirectMessageBackend,
  getNotificationBackend,
  getSocialBackend,
} from '@shared/lib/backend';
import { desktopClient } from '@platform/desktop/client';
import { getPlatformInviteBaseUrl } from '@platform/urls';
import { getErrorMessage } from '@platform/lib/errors';
import { installPromptTrap } from '@shared/lib/contextMenu/debugTrace';
import {
  DM_REPORT_REVIEW_PANEL_FLAG,
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  FRIENDS_SOCIAL_PANEL_FLAG,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
} from '@client/app/constants';
import type { PendingUiConfirmation, FriendsPanelTab } from '@client/app/types';
import { getPendingUiConfirmationCopy } from '@client/app/ui-confirmations';
import { useDesktopSettings } from '@client/features/desktop/hooks/useDesktopSettings';
import { useCommunityWorkspace } from '@client/features/community/hooks/useCommunityWorkspace';
import { useServerAdmin } from '@client/features/community/hooks/useServerAdmin';
import { useChannelManagement } from '@client/features/community/hooks/useChannelManagement';
import { useChannelGroups } from '@client/features/community/hooks/useChannelGroups';
import { useMessages } from '@client/features/messages/hooks/useMessages';
import { useNotifications } from '@client/features/notifications/hooks/useNotifications';
import { useNotificationInteractions } from '@client/features/notifications/hooks/useNotificationInteractions';
import { useDeepLinks } from '@client/app/hooks/useDeepLinks';
import { useSocialWorkspace } from '@client/features/social/hooks/useSocialWorkspace';
import { useDirectMessages } from '@client/features/direct-messages/hooks/useDirectMessages';
import { useDirectMessageInteractions } from '@client/features/direct-messages/hooks/useDirectMessageInteractions';
import { useVoice } from '@client/features/voice/hooks/useVoice';
import { useFeatureFlags } from '@client/features/session/hooks/useFeatureFlags';
import { usePlatformSession } from '@client/features/session/hooks/usePlatformSession';
import type {
  AuthorProfile,
  BanEligibleServer,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  Message,
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
} from '@shared/lib/backend/types';
import type { ForceDisconnectVoiceReason } from '@client/features/voice/types';
import { useServersStore } from '@shared/stores/serversStore';
import { toast } from 'sonner';

// Pure utility — no hook deps, stable across renders.
const normalizeInviteCode = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const maybeFromPath = trimmed.split('?')[0].replace(/\/+$/, '');
  if (maybeFromPath.includes('/')) {
    const pathSegments = maybeFromPath.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) return lastSegment.toUpperCase();
  }
  return maybeFromPath.toUpperCase();
};

export function useChatAppOrchestration() {
  const activeServerAccessLostHandlerRef = useRef<(serverId: string) => void>(() => {});
  const activeChannelAccessLostHandlerRef = useRef<
    (channelId: string, channelName: string) => void
  >(() => {});
  const memberBannedHandlerRef = useRef<(payload: MemberBannedBroadcastPayload) => void>(() => {});
  const memberChannelAccessRevokedHandlerRef = useRef<
    (payload: MemberChannelAccessRevokedBroadcastPayload) => void
  >(() => {});
  const serverNameByIdRef = useRef<Record<string, string>>({});
  const handleActiveServerAccessLost = useCallback((serverId: string) => {
    activeServerAccessLostHandlerRef.current(serverId);
  }, []);
  const handleActiveChannelAccessLost = useCallback((channelId: string, channelName: string) => {
    activeChannelAccessLostHandlerRef.current(channelId, channelName);
  }, []);
  const handleMemberBanned = useCallback((payload: MemberBannedBroadcastPayload) => {
    memberBannedHandlerRef.current(payload);
  }, []);
  const handleMemberChannelAccessRevoked = useCallback(
    (payload: MemberChannelAccessRevokedBroadcastPayload) => {
      memberChannelAccessRevokedHandlerRef.current(payload);
    },
    []
  );

  // ── Backend singletons ────────────────────────────────────────────────────
  const controlPlaneBackend = getControlPlaneBackend();
  const directMessageBackend = getDirectMessageBackend();
  const notificationBackend = getNotificationBackend();
  const socialBackend = getSocialBackend();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const {
    user,
    status: authStatus,
    error: authError,
    passwordRecoveryRequired,
    completePasswordRecovery,
    signOut,
    deleteAccount,
  } = useAuth();

  // ── Servers ───────────────────────────────────────────────────────────────
  const {
    servers,
    status: serversStatus,
    error: serversError,
    createServer,
    refreshServers,
  } = useServers({
    onActiveServerAccessLost: handleActiveServerAccessLost,
  });
  const isServersLoading = serversStatus === 'loading';

  // ── Feature flags ─────────────────────────────────────────────────────────
  const {
    state: { featureFlagsLoaded },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({ controlPlaneBackend, userId: user?.id });

  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS || hasFeatureFlag('debug_channel_reload_diagnostics');
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(VOICE_HARDWARE_DEBUG_PANEL_FLAG);
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;

  // ── Platform session ──────────────────────────────────────────────────────
  const {
    state: {
      profileUsername,
      profileAvatarUrl,
      isPlatformStaff,
      platformStaffPrefix,
      canPostHavenDevMessage,
    },
    actions: { resetPlatformSession, applyLocalProfileUpdate },
  } = usePlatformSession({
    controlPlaneBackend,
    userId: user?.id,
    userEmail: user?.email,
  });

  const baseUserDisplayName = profileUsername || user?.email?.split('@')[0] || 'User';
  const userDisplayName = isPlatformStaff
    ? `${platformStaffPrefix ?? 'Haven'}-${baseUserDisplayName}`
    : baseUserDisplayName;

  // ── UI / workspace state ──────────────────────────────────────────────────
  const [workspaceMode, setWorkspaceMode] = useState<'community' | 'dm'>('community');
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const [dmReportReviewPanelOpen, setDmReportReviewPanelOpen] = useState(false);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showChannelSettingsModal, setShowChannelSettingsModal] = useState(false);
  const [channelSettingsTargetId, setChannelSettingsTargetId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showVoiceSettingsModal, setShowVoiceSettingsModal] = useState(false);
  const [userVoiceHardwareTestOpen, setUserVoiceHardwareTestOpen] = useState(false);

  // ── Draft / confirmation state ────────────────────────────────────────────
  const [renameServerDraft, setRenameServerDraft] = useState<{
    serverId: string;
    currentName: string;
  } | null>(null);
  const [renameChannelDraft, setRenameChannelDraft] = useState<{
    channelId: string;
    currentName: string;
  } | null>(null);
  const [renameGroupDraft, setRenameGroupDraft] = useState<{
    groupId: string;
    currentName: string;
  } | null>(null);
  const [createGroupDraft, setCreateGroupDraft] = useState<{
    channelId: string | null;
  } | null>(null);
  const [pendingUiConfirmation, setPendingUiConfirmation] =
    useState<PendingUiConfirmation | null>(null);

  // ── Message / author profile state ────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachment[]>([]);
  const [messageLinkPreviews, setMessageLinkPreviews] = useState<MessageLinkPreview[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});
  const [canSendHavenDeveloperMessage, setCanSendHavenDeveloperMessage] = useState(false);

  // ── Community workspace ───────────────────────────────────────────────────
  const {
    state: {
      channels,
      channelsLoading,
      channelsError,
      currentChannelId,
      currentServerId,
      serverPermissions,
    },
    derived: {
      currentServer,
      currentChannel,
      channelSettingsTarget,
      currentRenderableChannel,
      currentChannelKind,
    },
    actions: {
      resetChannelsWorkspace,
      setChannels,
      setCurrentChannelId,
      setCurrentServerId,
      resetServerPermissions,
      prefetchServersChannels,
      getDefaultChannelIdForServer,
    },
  } = useCommunityWorkspace({
    servers,
    currentUserId: user?.id ?? null,
    channelSettingsTargetId,
    onMemberBanned: handleMemberBanned,
    onMemberChannelAccessRevoked: handleMemberChannelAccessRevoked,
  });

  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites ||
    serverPermissions.canManageDeveloperAccess;
  const canManageCurrentServer =
    serverPermissions.isOwner || serverPermissions.canManageServer;

  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === 'dm';
  const dmReportReviewPanelEnabled =
    isPlatformStaff && hasFeatureFlag(DM_REPORT_REVIEW_PANEL_FLAG);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const {
    state: {
      activeVoiceChannelId,
      voicePanelOpen,
      voiceHardwareDebugPanelOpen,
      voiceConnected,
      voiceParticipants,
      voiceSessionState,
      voiceControlActions,
      voiceJoinPrompt,
    },
    derived: { activeVoiceChannel, voiceChannelParticipants, activeVoiceParticipantCount },
    actions: {
      setVoicePanelOpen,
      setVoiceHardwareDebugPanelOpen,
      setVoiceConnected,
      setVoiceParticipants,
      setVoiceSessionState,
      setVoiceControlActions,
      resetVoiceState,
      requestVoiceChannelJoin,
      confirmVoiceChannelJoin,
      cancelVoiceChannelJoinPrompt,
      disconnectVoiceSession,
      forceDisconnectVoice,
    },
  } = useVoice({
    currentServerId,
    currentUserId: user?.id,
    currentUserDisplayName: userDisplayName,
    currentUserAvatarUrl: profileAvatarUrl,
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled,
    channels,
  });

  // ── Channel groups ────────────────────────────────────────────────────────
  const {
    state: { channelGroupState },
    actions: {
      resetChannelGroups,
      createChannelGroup,
      assignChannelToGroup,
      removeChannelFromGroup,
      setChannelGroupCollapsed,
      renameChannelGroup,
      deleteChannelGroup,
    },
  } = useChannelGroups({
    currentServerId,
    currentUserId: user?.id ?? null,
    currentChannelId,
    channels,
    onActiveChannelAccessLost: handleActiveChannelAccessLost,
  });

  const sidebarChannelGroups = channelGroupState.groups.map((group) => ({
    id: group.id,
    name: group.name,
    channelIds: group.channelIds,
    isCollapsed: channelGroupState.collapsedGroupIds.includes(group.id),
  }));

  // ── Server admin ──────────────────────────────────────────────────────────
  const {
    state: {
      showMembersModal,
      membersModalCommunityId,
      membersModalServerName,
      membersModalMembers,
      membersModalLoading,
      membersModalError,
      membersModalCanCreateReports,
      membersModalCanManageBans,
      communityBans,
      communityBansLoading,
      communityBansError,
      serverInvites,
      serverInvitesLoading,
      serverInvitesError,
      serverRoles,
      serverMembers,
      serverPermissionCatalog,
      serverRoleManagementLoading,
      serverRoleManagementError,
      serverSettingsInitialValues,
      serverSettingsLoading,
      serverSettingsLoadError,
    },
    actions: {
      resetMembersModal,
      closeMembersModal,
      openServerMembersModal,
      refreshMembersModalMembersIfOpen,
      resetCommunityBans,
      loadCommunityBans,
      unbanUserFromCurrentServer,
      resetServerInvites,
      createServerInvite,
      revokeServerInvite,
      resetServerRoleManagement,
      createServerRole,
      updateServerRole,
      deleteServerRole,
      saveServerRolePermissions,
      saveServerMemberRoles,
      resetServerSettingsState,
      saveServerSettings,
      openServerSettingsModal,
      leaveServer,
      deleteServer,
      renameServer,
    },
  } = useServerAdmin({
    servers,
    controlPlaneBackend,
    currentServerId,
    currentUserId: user?.id ?? null,
    canManageDeveloperAccess: serverPermissions.canManageDeveloperAccess,
    canManageInvites: serverPermissions.canManageInvites,
    isServerSettingsModalOpen: showServerSettingsModal,
    setCurrentServerId,
    setShowServerSettingsModal,
    refreshServers,
    onActiveServerRemoved: () => {
      setCurrentServerId(null);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
    },
  });

  // ── Channel management ────────────────────────────────────────────────────
  const {
    state: {
      channelRolePermissions,
      channelMemberPermissions,
      channelPermissionMemberOptions,
      channelPermissionsLoading,
      channelPermissionsLoadError,
    },
    actions: {
      resetChannelPermissionsState,
      createChannel,
      saveChannelSettings,
      renameChannel,
      deleteChannel,
      deleteCurrentChannel,
      openChannelSettingsModal,
      saveRoleChannelPermissions,
      saveMemberChannelPermissions: saveMemberChannelPermissionsRaw,
    },
  } = useChannelManagement({
    currentServerId,
    currentUserId: user?.id ?? null,
    currentChannelId,
    channelSettingsTargetId,
    channels,
    setChannels,
    setCurrentChannelId,
    setChannelSettingsTargetId,
    setShowChannelSettingsModal,
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  const {
    state: { hasOlderMessages, isLoadingOlderMessages },
    actions: {
      resetMessageState,
      requestOlderMessages,
      sendMessage,
      toggleMessageReaction,
      editMessage,
      deleteMessage,
      reportMessage,
      requestMessageLinkPreviewRefresh,
      prefetchChannelMessages,
      purgeMessageBundleCacheForServer,
      purgeMessageBundleCacheForChannel,
      applyBannedUserContentVisibility,
      applyChannelAccessRevokedContentVisibility,
    },
  } = useMessages({
    currentServerId,
    currentChannelId,
    currentUserId: user?.id ?? null,
    debugChannelReloads,
    channels,
    setMessages,
    setMessageReactions,
    setMessageAttachments,
    setMessageLinkPreviews,
    setAuthorProfiles,
    authorProfileCacheRef,
  });

  const handleServerAccessLossReset = useCallback(
    (serverId: string) => {
      if (!serverId) return;

      // CHECKPOINT 2 COMPLETE
      useServersStore.getState().setCurrentServerId(null);
      useServersStore.getState().setCurrentServer(null);
      resetMessageState();
      resetChannelGroups();
      resetChannelsWorkspace();
      resetServerPermissions();
      purgeMessageBundleCacheForServer(serverId);
      setCurrentServerId(null);
      setWorkspaceMode('community');
    },
    [
      purgeMessageBundleCacheForServer,
      resetChannelGroups,
      resetChannelsWorkspace,
      resetMessageState,
      resetServerPermissions,
      setCurrentServerId,
    ]
  );

  const disconnectVoiceForAccessLoss = useCallback(
    async (input: { serverId?: string; channelId?: string }) => {
      const activeChannel = activeVoiceChannel;
      if (!activeChannel) return;

      const losesServerAccess =
        Boolean(input.serverId) && activeChannel.community_id === input.serverId;
      const losesChannelAccess =
        Boolean(input.channelId) && activeChannel.id === input.channelId;
      if (!losesServerAccess && !losesChannelAccess) return false;

      // CHECKPOINT 2 COMPLETE
      await forceDisconnectVoice('access_lost');
      return true;
    },
    [activeVoiceChannel, forceDisconnectVoice]
  );

  const showVoiceDisconnectToast = useCallback(
    (input: {
      reason: ForceDisconnectVoiceReason;
      accessScope?: 'server' | 'channel';
    }) => {
      let message = 'You have been disconnected from voice.';
      switch (input.reason) {
        case 'access_lost':
          message =
            input.accessScope === 'channel'
              ? 'You have been disconnected from voice. You no longer have access to this channel.'
              : 'You have been disconnected from voice. You no longer have access to this server.';
          break;
        case 'kicked':
          message = 'You have been removed from this voice channel.';
          break;
        case 'ban':
          message = 'You have been disconnected from voice.';
          break;
        default:
          break;
      }

      const toastId = `voice-disconnect:${input.reason}:${input.accessScope ?? 'generic'}`;
      // CHECKPOINT 3 COMPLETE
      toast(message, {
        id: toastId,
        action: {
          label: 'Dismiss',
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    []
  );

  useEffect(() => {
    const nextServerNameById = { ...serverNameByIdRef.current };
    for (const server of servers) {
      nextServerNameById[server.id] = server.name;
    }
    if (currentServer) {
      nextServerNameById[currentServer.id] = currentServer.name;
    }
    serverNameByIdRef.current = nextServerNameById;
  }, [currentServer, servers]);

  const handleServerAccessLostCascade = useCallback(
    async (serverId: string) => {
      if (!serverId) return;

      const lostServerName =
        (currentServerId === serverId ? currentServer?.name : null) ??
        serverNameByIdRef.current[serverId] ??
        'Unknown server';

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({ serverId });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({ reason: 'access_lost', accessScope: 'server' });
      }
      handleServerAccessLossReset(serverId);

      const toastId = `server-access-lost:${serverId}`;
      // CHECKPOINT 3 COMPLETE
      toast(`You have been removed from ${lostServerName}.`, {
        id: toastId,
        action: {
          label: 'Dismiss',
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [
      currentServer,
      currentServerId,
      disconnectVoiceForAccessLoss,
      handleServerAccessLossReset,
      showVoiceDisconnectToast,
    ]
  );

  activeServerAccessLostHandlerRef.current = handleServerAccessLostCascade;

  const handleChannelAccessLostCascade = useCallback(
    async (channelId: string, channelName: string) => {
      if (!channelId || !currentServerId) return;

      const communityBackend = getCommunityDataBackend(currentServerId);
      const nextChannelId =
        channels.find(
          (channel) =>
            channel.community_id === currentServerId &&
            channel.kind === 'text' &&
            channel.id !== channelId
        )?.id ?? null;

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({ channelId });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({ reason: 'access_lost', accessScope: 'channel' });
      }
      if (user?.id) {
        applyChannelAccessRevokedContentVisibility({
          communityId: currentServerId,
          channelId,
          revokedUserId: user.id,
        });
        try {
          await communityBackend.broadcastMemberChannelAccessRevoked({
            communityId: currentServerId,
            channelId,
            revokedUserId: user.id,
          }); // CHECKPOINT 3 COMPLETE
        } catch (error) {
          console.error('Failed to broadcast channel access revocation:', error);
        }
      }
      // CHECKPOINT 4 COMPLETE
      purgeMessageBundleCacheForChannel(currentServerId, channelId);
      resetMessageState();
      setCurrentChannelId(nextChannelId);

      const toastId = `channel-access-lost:${currentServerId}:${channelId}`;
      toast(`Your access to #${channelName} has been revoked.`, {
        id: toastId,
        action: {
          label: 'Dismiss',
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [
      channels,
      currentServerId,
      disconnectVoiceForAccessLoss,
      applyChannelAccessRevokedContentVisibility,
      purgeMessageBundleCacheForChannel,
      resetMessageState,
      setCurrentChannelId,
      showVoiceDisconnectToast,
      user?.id,
    ]
  );

  activeChannelAccessLostHandlerRef.current = handleChannelAccessLostCascade;

  const handleMemberBannedBroadcast = useCallback(
    (payload: MemberBannedBroadcastPayload) => {
      if (!payload.communityId || !payload.bannedUserId) return;
      if (payload.bannedUserId === user?.id) return;
      applyBannedUserContentVisibility(payload); // CHECKPOINT 4 COMPLETE
    },
    [applyBannedUserContentVisibility, user?.id]
  );

  memberBannedHandlerRef.current = handleMemberBannedBroadcast;

  const handleMemberChannelAccessRevokedBroadcast = useCallback(
    (payload: MemberChannelAccessRevokedBroadcastPayload) => {
      if (!payload.communityId || !payload.channelId || !payload.revokedUserId) return;
      if (payload.revokedUserId === user?.id) return;
      applyChannelAccessRevokedContentVisibility(payload);
    },
    [applyChannelAccessRevokedContentVisibility, user?.id]
  );

  memberChannelAccessRevokedHandlerRef.current = handleMemberChannelAccessRevokedBroadcast;

  // ── Desktop settings ──────────────────────────────────────────────────────
  const {
    state: {
      appSettings,
      appSettingsLoading,
      updaterStatus,
      updaterStatusLoading,
      checkingForUpdates,
      notificationAudioSettingsSaving,
      notificationAudioSettingsError,
      voiceSettingsSaving,
      voiceSettingsError,
    },
    actions: {
      setAutoUpdateEnabled,
      setNotificationAudioSettings,
      setVoiceSettings,
      checkForUpdatesNow,
    },
  } = useDesktopSettings();

  // â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const {
    state: {
      notificationItems,
      notificationCounts,
      notificationsLoading,
      notificationsRefreshing,
      notificationsError,
      notificationPreferences,
      notificationPreferencesLoading,
      notificationPreferencesSaving,
      notificationPreferencesError,
    },
    actions: {
      resetNotifications,
      refreshNotificationInbox,
      saveNotificationPreferences,
      refreshNotificationsManually,
      markAllNotificationsSeen,
      markNotificationRead,
      dismissNotification,
      dismissAllNotifications,
      setNotificationsError,
    },
  } = useNotifications({
    notificationBackend,
    userId: user?.id,
    notificationsPanelOpen,
    audioSettings: appSettings.notifications,
    autoMarkSeenOnPanelOpen: false,
  });

  // â”€â”€ Social / Friends â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const {
    state: {
      friendsPanelOpen,
      friendsPanelRequestedTab,
      friendsPanelHighlightedRequestId,
      socialCounts,
    },
    actions: {
      setFriendsPanelOpen,
      setFriendsPanelRequestedTab,
      setFriendsPanelHighlightedRequestId,
      refreshSocialCounts,
      resetSocialWorkspace,
    },
  } = useSocialWorkspace({
    socialBackend,
    userId: user?.id,
    enabled: friendsSocialPanelEnabled,
  });

  // ── Direct messages ───────────────────────────────────────────────────────
  const {
    state: {
      dmConversations,
      dmConversationsLoading,
      dmConversationsRefreshing,
      dmConversationsError,
      selectedDmConversationId,
      dmMessages,
      dmMessagesLoading,
      dmMessagesRefreshing,
      dmMessagesError,
      dmMessageSendPending,
    },
    actions: {
      resetDirectMessages,
      clearSelectedDmConversation,
      refreshDmConversations,
      refreshDmMessages,
      setSelectedDmConversationId,
      setDmConversationsError,
      openDirectMessageConversation,
      openDirectMessageWithUser,
      sendDirectMessage,
      toggleSelectedDmConversationMuted,
      reportDirectMessage,
    },
  } = useDirectMessages({
    directMessageBackend,
    userId: user?.id,
    enabled: dmWorkspaceEnabled,
    isActive: dmWorkspaceIsActive,
  });

  const showDmWorkspace = dmWorkspaceIsActive;
  const selectedDmConversation =
    selectedDmConversationId
      ? dmConversations.find((c) => c.conversationId === selectedDmConversationId) ?? null
      : null;

  // ── DM interactions ───────────────────────────────────────────────────────
  const {
    actions: { openDirectMessagesWorkspace, directMessageUser, blockDirectMessageUser },
  } = useDirectMessageInteractions({
    dmWorkspaceEnabled,
    friendsSocialPanelEnabled,
    currentUserId: user?.id,
    setDmConversationsError,
    refreshDmConversations,
    openDirectMessageWithUser,
    clearSelectedDmConversation,
    socialBackend,
    refreshSocialCounts,
    refreshNotificationInbox,
    onOpenDmWorkspace: () => {
      setWorkspaceMode('dm');
      setNotificationsPanelOpen(false);
      setFriendsPanelOpen(false);
      setFriendsPanelRequestedTab(null);
      setFriendsPanelHighlightedRequestId(null);
    },
    onEnterDmWorkspace: () => {
      setWorkspaceMode('dm');
    },
    onOpenFriendsAddPanel: () => {
      setFriendsPanelRequestedTab('add');
      setFriendsPanelHighlightedRequestId(null);
      setFriendsPanelOpen(true);
    },
  });

  // ── Notification interactions ─────────────────────────────────────────────
  const {
    actions: {
      openNotificationItem,
      acceptFriendRequestFromNotification,
      declineFriendRequestFromNotification,
      dismissFriendRequestNotification,
    },
  } = useNotificationInteractions({
    notificationBackend,
    socialBackend,
    friendsSocialPanelEnabled,
    refreshNotificationInbox,
    refreshSocialCounts,
    setNotificationsError,
    onOpenDmConversation: async (conversationId) => {
      setWorkspaceMode('dm');
      await openDirectMessageConversation(conversationId);
      setNotificationsPanelOpen(false);
    },
    onOpenFriendsPanel: ({ tab, highlightedRequestId }) => {
      setFriendsPanelRequestedTab(tab as FriendsPanelTab);
      setFriendsPanelHighlightedRequestId(highlightedRequestId);
      setFriendsPanelOpen(true);
      setNotificationsPanelOpen(false);
    },
    onOpenChannelMention: ({ communityId, channelId }) => {
      setWorkspaceMode('community');
      setCurrentServerId(communityId);
      setCurrentChannelId(channelId);
      setNotificationsPanelOpen(false);
    },
  });

  // ── Business functions ────────────────────────────────────────────────────
  const joinServerByInvite = useCallback(
    async (inviteInput: string): Promise<{ communityName: string; joined: boolean }> => {
      const code = normalizeInviteCode(inviteInput);
      if (!code) throw new Error('Invite code is required.');
      const redeemedInvite = await controlPlaneBackend.redeemCommunityInvite(code);
      await refreshServers();
      setCurrentServerId(redeemedInvite.communityId);
      return { communityName: redeemedInvite.communityName, joined: redeemedInvite.joined };
    },
    [controlPlaneBackend, refreshServers, setCurrentServerId]
  );

  const saveAttachment = useCallback(async (attachment: MessageAttachment) => {
    if (!attachment.signedUrl) throw new Error('Media link is not available.');
    if (!desktopClient.isAvailable()) {
      window.open(attachment.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const suggestedName =
      attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'media';
    await desktopClient.saveFileFromUrl({ url: attachment.signedUrl, suggestedName });
  }, []);

  const reportUserProfile = useCallback(
    async (input: { targetUserId: string; reason: string; communityId?: string }) => {
      if (!user) throw new Error('Not authenticated.');
      const targetCommunityId = input.communityId ?? currentServerId;
      if (!targetCommunityId) throw new Error('No server selected.');
      const communityBackend = getCommunityDataBackend(targetCommunityId);
      await communityBackend.reportUserProfile({
        communityId: targetCommunityId,
        targetUserId: input.targetUserId,
        reporterUserId: user.id,
        reason: input.reason,
      });
    },
    [user, currentServerId]
  );

  const banUserFromServer = useCallback(
    async (input: { targetUserId: string; communityId: string; reason: string }) => {
      const communityBackend = getCommunityDataBackend(input.communityId);
      const banResult = await communityBackend.banCommunityMember({
        communityId: input.communityId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });
      applyBannedUserContentVisibility(banResult); // CHECKPOINT 3 COMPLETE
      try {
        await communityBackend.broadcastMemberBanned(banResult); // CHECKPOINT 4 COMPLETE
      } catch (error) {
        console.error('Failed to broadcast member ban:', error);
      }
      try {
        await refreshMembersModalMembersIfOpen(input.communityId);
      } catch (error) {
        console.error('Failed to refresh members after ban:', error);
      }
      if (showServerSettingsModal && currentServerId === input.communityId) {
        try {
          await loadCommunityBans(input.communityId);
        } catch (error) {
          console.error('Failed to refresh bans after ban:', error);
        }
      }
    },
    [
      applyBannedUserContentVisibility,
      refreshMembersModalMembersIfOpen,
      loadCommunityBans,
      showServerSettingsModal,
      currentServerId,
    ]
  );

  const saveMemberChannelPermissions = useCallback(
    async (memberId: string, permissions: { canView: boolean | null; canSend: boolean | null; canManage: boolean | null }) => {
      const accessRevokedResult = await saveMemberChannelPermissionsRaw(memberId, permissions);
      if (!accessRevokedResult) return;
      applyChannelAccessRevokedContentVisibility(accessRevokedResult); // CHECKPOINT 2 COMPLETE
    },
    [applyChannelAccessRevokedContentVisibility, saveMemberChannelPermissionsRaw]
  );

  const resolveBanEligibleServers = useCallback(
    async (targetUserId: string): Promise<BanEligibleServer[]> => {
      if (!targetUserId) return [];
      return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
    },
    [controlPlaneBackend]
  );

  const sendHavenDeveloperMessage = useCallback(
    async (
      content: string,
      options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
    ) => {
      if (!currentChannelId || !currentServerId) return;
      const communityBackend = getCommunityDataBackend(currentServerId);
      await communityBackend.postHavenDeveloperMessage({
        communityId: currentServerId,
        channelId: currentChannelId,
        content,
        replyToMessageId: options?.replyToMessageId,
        mediaUpload: options?.mediaFile
          ? { file: options.mediaFile, expiresInHours: options.mediaExpiresInHours }
          : undefined,
      });
    },
    [currentServerId, currentChannelId]
  );

  const saveAccountSettings = useCallback(
    async (values: { username: string; avatarUrl: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      await controlPlaneBackend.updateUserProfile({
        userId: user.id,
        username: values.username,
        avatarUrl: values.avatarUrl,
      });
      applyLocalProfileUpdate(values);
    },
    [user, controlPlaneBackend, applyLocalProfileUpdate]
  );

  // ── Deep links ────────────────────────────────────────────────────────────
  useDeepLinks({
    user,
    featureFlagsLoaded,
    friendsSocialPanelEnabled,
    joinServerByInvite,
    openDirectMessageConversation,
    setWorkspaceMode,
    setNotificationsPanelOpen,
    setFriendsPanelOpen,
    setFriendsPanelRequestedTab,
    setFriendsPanelHighlightedRequestId,
    setCurrentServerId,
    setCurrentChannelId,
  });

  // ── Handle functions (UI event → business action) ─────────────────────────
  const handleLeaveServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      setPendingUiConfirmation({
        kind: 'leave-server',
        communityId,
        serverName: server?.name ?? 'this server',
      });
    },
    [servers]
  );

  const handleDeleteServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      setPendingUiConfirmation({
        kind: 'delete-server',
        communityId,
        serverName: server?.name ?? 'this server',
      });
    },
    [servers]
  );

  const handleRenameServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      if (!server) return;
      setRenameServerDraft({ serverId: communityId, currentName: server.name });
    },
    [servers]
  );

  const handleRenameChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      setRenameChannelDraft({ channelId, currentName: channel.name });
    },
    [channels]
  );

  const handleDeleteChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      setPendingUiConfirmation({ kind: 'delete-channel', channelId, channelName: channel.name });
    },
    [channels]
  );

  const handleCreateChannelGroup = useCallback((channelId?: string) => {
    setCreateGroupDraft({ channelId: channelId ?? null });
  }, []);

  const handleRenameChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupState.groups.find((g) => g.id === groupId);
      if (!group) return;
      setRenameGroupDraft({ groupId, currentName: group.name });
    },
    [channelGroupState.groups]
  );

  const handleDeleteChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupState.groups.find((g) => g.id === groupId);
      if (!group) return;
      setPendingUiConfirmation({
        kind: 'delete-channel-group',
        groupId,
        groupName: group.name,
      });
    },
    [channelGroupState.groups]
  );

  const confirmPendingUiAction = useCallback(() => {
    if (!pendingUiConfirmation) return;
    const action = pendingUiConfirmation;
    setPendingUiConfirmation(null);
    switch (action.kind) {
      case 'leave-server':
        void leaveServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to leave server.'), {
            id: 'leave-server-error',
          });
        });
        return;
      case 'delete-server':
        void deleteServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete server.'), {
            id: 'delete-server-error',
          });
        });
        return;
      case 'delete-channel':
        void deleteChannel(action.channelId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete channel.'), {
            id: 'delete-channel-error',
          });
        });
        return;
      case 'delete-channel-group':
        void deleteChannelGroup(action.groupId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete channel group.'), {
            id: 'delete-channel-group-error',
          });
        });
        return;
      default:
        return;
    }
  }, [pendingUiConfirmation, leaveServer, deleteServer, deleteChannel, deleteChannelGroup]);

  // ── Pending UI confirmation copy (derived, stable) ────────────────────────
  const {
    title: pendingUiConfirmationTitle,
    description: pendingUiConfirmationDescription,
    confirmLabel: pendingUiConfirmationConfirmLabel,
    isDestructive: pendingUiConfirmationIsDestructive,
  } = getPendingUiConfirmationCopy(pendingUiConfirmation);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (friendsSocialPanelEnabled) return;
    resetSocialWorkspace();
    setWorkspaceMode('community');
    resetDirectMessages();
  }, [friendsSocialPanelEnabled, resetDirectMessages, resetSocialWorkspace]);

  useEffect(() => {
    if (dmReportReviewPanelEnabled) return;
    setDmReportReviewPanelOpen(false);
  }, [dmReportReviewPanelEnabled]);

  // Sign-out reset — clear all state when user logs out.
  useEffect(() => {
    if (user) return;
    resetPlatformSession();
    resetVoiceState();
    setDmReportReviewPanelOpen(false);
    setNotificationsPanelOpen(false);
    setShowVoiceSettingsModal(false);
    setUserVoiceHardwareTestOpen(false);
    setFriendsPanelOpen(false);
    setWorkspaceMode('community');
    resetMessageState();
    setAuthorProfiles({});
    authorProfileCacheRef.current = {};
    resetFeatureFlags();
    resetNotifications();
    resetSocialWorkspace();
    resetDirectMessages();
    resetChannelsWorkspace();
    resetServerPermissions();
    resetServerSettingsState();
    setShowCreateChannelModal(false);
    setShowJoinServerModal(false);
    setShowServerSettingsModal(false);
    setShowChannelSettingsModal(false);
    setChannelSettingsTargetId(null);
    setShowAccountModal(false);
    resetServerInvites();
    resetServerRoleManagement();
    resetChannelPermissionsState();
    resetChannelGroups();
    resetMembersModal();
    setRenameServerDraft(null);
    setRenameChannelDraft(null);
    setRenameGroupDraft(null);
    setCreateGroupDraft(null);
    resetCommunityBans();
  }, [
    resetChannelGroups,
    resetChannelsWorkspace,
    resetChannelPermissionsState,
    resetCommunityBans,
    resetDirectMessages,
    resetFeatureFlags,
    resetMembersModal,
    resetMessageState,
    resetNotifications,
    resetPlatformSession,
    resetServerInvites,
    resetServerPermissions,
    resetServerRoleManagement,
    resetServerSettingsState,
    resetVoiceState,
    user,
  ]);

  // Reset server-scoped UI when no server is selected.
  useEffect(() => {
    if (currentServerId) return;
    resetChannelsWorkspace();
    resetVoiceState();
    setMessages([]);
    setMessageReactions([]);
    setMessageAttachments([]);
    setMessageLinkPreviews([]);
    setAuthorProfiles({});
    setShowCreateChannelModal(false);
    setShowJoinServerModal(false);
    setShowServerSettingsModal(false);
    setShowChannelSettingsModal(false);
    setChannelSettingsTargetId(null);
    resetServerSettingsState();
    resetServerInvites();
    resetServerRoleManagement();
    resetChannelPermissionsState();
    resetChannelGroups();
    resetMembersModal();
    setRenameChannelDraft(null);
    setRenameGroupDraft(null);
    setCreateGroupDraft(null);
    resetCommunityBans();
  }, [
    currentServerId,
    resetChannelGroups,
    resetChannelPermissionsState,
    resetChannelsWorkspace,
    resetCommunityBans,
    resetMembersModal,
    resetServerInvites,
    resetServerRoleManagement,
    resetVoiceState,
  ]);

  // Determine whether Haven Developer messaging is allowed in the current channel.
  useEffect(() => {
    let isMounted = true;
    if (!user || !currentServerId || !currentChannelId || !canPostHavenDevMessage) {
      setCanSendHavenDeveloperMessage(false);
      return;
    }
    const selectedChannel = channels.find((ch) => ch.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      setCanSendHavenDeveloperMessage(false);
      return;
    }
    const communityBackend = getCommunityDataBackend(currentServerId);
    void (async () => {
      try {
        const allowed = await communityBackend.isHavenDeveloperMessagingAllowed({
          communityId: currentServerId,
          channelId: currentChannelId,
        });
        if (isMounted) setCanSendHavenDeveloperMessage(allowed);
      } catch {
        if (isMounted) setCanSendHavenDeveloperMessage(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [user, currentServerId, currentChannelId, canPostHavenDevMessage, channels]);

  // ── Background prefetch: warm caches for instant server switching ─────────
  useEffect(() => {
    if (servers.length === 0 || !user?.id) return;
    const serverIds = servers.map((s) => s.id);
    void (async () => {
      await prefetchServersChannels(serverIds);
      // After channel lists are warm, prefetch default channel messages for non-active servers
      await Promise.allSettled(
        serverIds
          .filter((id) => id !== currentServerId)
          .map((id) => {
            const defaultChannelId = getDefaultChannelIdForServer(id);
            if (!defaultChannelId) return Promise.resolve();
            return prefetchChannelMessages(id, defaultChannelId);
          })
      );
    })();
  }, [servers, user?.id, currentServerId, prefetchServersChannels, getDefaultChannelIdForServer, prefetchChannelMessages]);

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // auth
    user, authStatus, authError,
    passwordRecoveryRequired, completePasswordRecovery, signOut, deleteAccount,
    // servers
    servers, serversStatus, serversError, isServersLoading, createServer,
    // session / profile
    profileUsername, profileAvatarUrl, isPlatformStaff, platformStaffPrefix,
    userDisplayName, baseUserDisplayName, applyLocalProfileUpdate,
    // feature flags
    hasFeatureFlag, friendsSocialPanelEnabled, dmWorkspaceEnabled,
    dmWorkspaceIsActive, dmReportReviewPanelEnabled, voiceHardwareDebugPanelEnabled,
    // community
    channels, channelsLoading, channelsError, currentChannelId, currentServerId,
    serverPermissions, currentServer, currentChannel, channelSettingsTarget,
    currentRenderableChannel, currentChannelKind,
    setCurrentChannelId, setCurrentServerId,
    canOpenServerSettings, canManageCurrentServer,
    // voice
    activeVoiceChannelId, voicePanelOpen, voiceHardwareDebugPanelOpen,
    voiceConnected, voiceParticipants, voiceSessionState,
    voiceControlActions, voiceJoinPrompt, activeVoiceChannel,
    voiceChannelParticipants, activeVoiceParticipantCount,
    setVoicePanelOpen, setVoiceHardwareDebugPanelOpen, setVoiceConnected,
    setVoiceParticipants, setVoiceSessionState, setVoiceControlActions,
    requestVoiceChannelJoin, confirmVoiceChannelJoin,
    cancelVoiceChannelJoinPrompt, disconnectVoiceSession, forceDisconnectVoice,
    showVoiceDisconnectToast,
    // channel groups
    channelGroupState, sidebarChannelGroups, createChannelGroup, assignChannelToGroup,
    removeChannelFromGroup, setChannelGroupCollapsed, renameChannelGroup, deleteChannelGroup,
    // server admin
    showMembersModal, membersModalCommunityId, membersModalServerName,
    membersModalMembers, membersModalLoading, membersModalError,
    membersModalCanCreateReports, membersModalCanManageBans,
    communityBans, communityBansLoading, communityBansError,
    serverInvites, serverInvitesLoading, serverInvitesError,
    serverRoles, serverMembers, serverPermissionCatalog,
    serverRoleManagementLoading, serverRoleManagementError,
    serverSettingsInitialValues, serverSettingsLoading, serverSettingsLoadError,
    closeMembersModal, openServerMembersModal,
    createServerInvite, revokeServerInvite, createServerRole, updateServerRole,
    deleteServerRole, saveServerRolePermissions, saveServerMemberRoles,
    saveServerSettings, openServerSettingsModal, leaveServer, renameServer,
    loadCommunityBans, unbanUserFromCurrentServer,
    // channel management
    channelRolePermissions, channelMemberPermissions, channelPermissionMemberOptions,
    channelPermissionsLoading, channelPermissionsLoadError,
    createChannel, saveChannelSettings, renameChannel, deleteChannel,
    deleteCurrentChannel, openChannelSettingsModal,
    saveRoleChannelPermissions, saveMemberChannelPermissions,
    messages, messageReactions, messageAttachments, messageLinkPreviews,
    authorProfiles, hasOlderMessages, isLoadingOlderMessages,
    requestOlderMessages, sendMessage, toggleMessageReaction,
    editMessage, deleteMessage, reportMessage, requestMessageLinkPreviewRefresh,
    canSendHavenDeveloperMessage,
    // desktop settings
    appSettings, appSettingsLoading, updaterStatus, updaterStatusLoading,
    checkingForUpdates, notificationAudioSettingsSaving, notificationAudioSettingsError,
    voiceSettingsSaving, voiceSettingsError,
    setAutoUpdateEnabled, setNotificationAudioSettings, setVoiceSettings, checkForUpdatesNow,
    // notifications
    notificationsPanelOpen, setNotificationsPanelOpen,
    notificationItems, notificationCounts, notificationsLoading,
    notificationsRefreshing, notificationsError,
    notificationPreferences, notificationPreferencesLoading,
    notificationPreferencesSaving, notificationPreferencesError,
    refreshNotificationsManually, markAllNotificationsSeen,
    markNotificationRead, dismissNotification, dismissAllNotifications, saveNotificationPreferences,
    openNotificationItem, acceptFriendRequestFromNotification,
    declineFriendRequestFromNotification, dismissFriendRequestNotification,
    // social
    friendsPanelOpen, setFriendsPanelOpen,
    friendsPanelRequestedTab, setFriendsPanelRequestedTab,
    friendsPanelHighlightedRequestId, setFriendsPanelHighlightedRequestId,
    socialCounts, directMessageUser, blockDirectMessageUser, openDirectMessagesWorkspace,
    // direct messages
    dmConversations, dmConversationsLoading, dmConversationsRefreshing,
    dmConversationsError, selectedDmConversationId, selectedDmConversation,
    dmMessages, dmMessagesLoading, dmMessagesRefreshing, dmMessagesError,
    dmMessageSendPending, showDmWorkspace,
    refreshDmConversations, refreshDmMessages, sendDirectMessage,
    toggleSelectedDmConversationMuted, reportDirectMessage, openDirectMessageConversation,
    setSelectedDmConversationId,
    // ui state
    workspaceMode, setWorkspaceMode,
    composerHeight, setComposerHeight,
    dmReportReviewPanelOpen, setDmReportReviewPanelOpen,
    // modals
    showCreateModal, setShowCreateModal,
    showCreateChannelModal, setShowCreateChannelModal,
    showJoinServerModal, setShowJoinServerModal,
    showServerSettingsModal, setShowServerSettingsModal,
    showChannelSettingsModal, setShowChannelSettingsModal,
    showAccountModal, setShowAccountModal,
    showVoiceSettingsModal, setShowVoiceSettingsModal,
    userVoiceHardwareTestOpen, setUserVoiceHardwareTestOpen,
    // drafts / confirmations
    channelSettingsTargetId, setChannelSettingsTargetId,
    renameServerDraft, setRenameServerDraft,
    renameChannelDraft, setRenameChannelDraft,
    renameGroupDraft, setRenameGroupDraft,
    createGroupDraft, setCreateGroupDraft,
    pendingUiConfirmation, setPendingUiConfirmation,
    pendingUiConfirmationTitle, pendingUiConfirmationDescription,
    pendingUiConfirmationConfirmLabel, pendingUiConfirmationIsDestructive,
    confirmPendingUiAction,
    // handle functions
    handleLeaveServer, handleDeleteServer, handleRenameServer,
    handleRenameChannel, handleDeleteChannel,
    handleCreateChannelGroup, handleRenameChannelGroup, handleDeleteChannelGroup,
    // business actions
    joinServerByInvite, saveAttachment, reportUserProfile, banUserFromServer,
    resolveBanEligibleServers, sendHavenDeveloperMessage, saveAccountSettings,
    // cache helpers
    getDefaultChannelIdForServer,
    // misc
    getPlatformInviteBaseUrl,
  };
}
