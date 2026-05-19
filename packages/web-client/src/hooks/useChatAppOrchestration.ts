import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@shared/contexts/AuthContext";
import {
  useHavenCore,
  toChannel,
  resolvePreferredChannelIdForServer,
} from "@shared/core";
import { hydrateCommunityPermissions } from "@shared/features/community/communityPermissionsHydration";
import { useServers } from "@shared/features/community/hooks/useServers";
import {
  getControlPlaneBackend,
  getNotificationBackend,
  getSocialBackend,
} from "@shared/lib/backend";
import { getPlatformInviteBaseUrl } from "@platform/urls";
import {
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
} from "@shared/infrastructure/constants";
import type { FriendsPanelTab } from "@shared/types/types";
import { useDesktopSettings } from "@web-client/hooks/useDesktopSettings";
import { useServerAdmin } from "@shared/features/community/hooks/useServerAdmin";
import { useChannelManagement } from "@shared/features/community/hooks/useChannelManagement";
import { useChannelGroups } from "@shared/features/community/hooks/useChannelGroups";
import { useCurrentServerPermissionUi } from "@shared/features/community/hooks/useCurrentServerPermissionUi";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useNotifications } from "@shared/features/notifications/hooks/useNotifications";
import { useNotificationInteractions } from "@shared/features/notifications/hooks/useNotificationInteractions";
import { useDeepLinks } from "@web-client/hooks/useDeepLinks";
import { useDirectMessages } from "@shared/features/direct-messages/hooks/useDirectMessages";
import { useDirectMessageInteractions } from "@shared/features/direct-messages/hooks/useDirectMessageInteractions";
import { useVoice } from "@shared/features/voice/hooks/useVoice";
import { useFeatureFlags } from "@shared/infrastructure/useFeatureFlags";
import { useLiveProfiles } from "@shared/features/profile/hooks/useLiveProfiles";
import { usePlatformSession } from "@shared/features/profile/hooks/usePlatformSession";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import { useUiStore } from "@shared/stores/uiStore";
import { usePermissionsReportSlice } from "@web-client/chat-app/controllers/usePermissionsReportSlice";
import { useChatAppAccessAndBroadcastOrchestration } from "@web-client/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration";
import { useChatAppElevationEffects } from "@web-client/chat-app/controllers/useChatAppElevationEffects";
import { useChatAppBusinessActions } from "@web-client/chat-app/controllers/useChatAppBusinessActions";
import { useChatAppConfirmationHandlers } from "@web-client/chat-app/controllers/useChatAppConfirmationHandlers";
import { useChatAppLifecycleEffects } from "@web-client/chat-app/controllers/useChatAppLifecycleEffects";
import { useShellThemeSync } from "@web-client/hooks/useShellThemeSync";

export function useChatAppOrchestration() {
  const serverNameByIdRef = useRef<Record<string, string>>({});
  const [
    isCurrentUserElevatedInCurrentServer,
    setIsCurrentUserElevatedInCurrentServer,
  ] = useState(false);
  const [
    isCurrentUserElevatedInActiveVoiceServer,
    setIsCurrentUserElevatedInActiveVoiceServer,
  ] = useState(false);
  const [
    isCurrentUserElevatedInMembersModalServer,
    setIsCurrentUserElevatedInMembersModalServer,
  ] = useState(false);
  // ── Backend singletons ────────────────────────────────────────────────────
  const controlPlaneBackend = getControlPlaneBackend();
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
  } = useServers();
  const isServersLoading = serversStatus === "loading";

  const { managedReportServerIds, serverModmailEnabled } =
    usePermissionsReportSlice(user?.id, servers);

  // ── Feature flags ─────────────────────────────────────────────────────────
  const {
    state: { featureFlags, featureFlagsLoaded },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({ controlPlaneBackend, userId: user?.id });

  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS ||
    hasFeatureFlag("debug_channel_reload_diagnostics");
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(
    VOICE_HARDWARE_DEBUG_PANEL_FLAG,
  );
  const richComposerEnabled =
    hasFeatureFlag("rich_markdown_composer") || hasFeatureFlag("rich_composer");
  // ── Platform session ──────────────────────────────────────────────────────
  const {
    state: { profileUsername, profileAvatarUrl, profileThemeId, isPlatformStaff },
    actions: { resetPlatformSession, applyLocalProfileUpdate },
  } = usePlatformSession({
    controlPlaneBackend,
    userId: user?.id,
    userEmail: user?.email,
  });
  const notificationsPanelOpen = useUiStore(
    (state) => state.notificationsPanelOpen,
  );
  const setNotificationsPanelOpen = useUiStore(
    (state) => state.setNotificationsPanelOpen,
  );
  const { status: userStatus, setStatus: setUserStatus } = useUserStatusStore();
  const { rainbowMode: rainbowMode, setRainbowMode: setRainbowMode } =
    useUserStatusStore();

  const baseUserDisplayName =
    profileUsername || user?.email?.split("@")[0] || "User";
  const userDisplayName = baseUserDisplayName;

  const {
    actions: { upsertProfile: upsertLiveProfile },
  } = useLiveProfiles({
    controlPlaneBackend,
    userId: user?.id,
  });

  useEffect(() => {
    if (!user?.id) return;
    upsertLiveProfile({
      userId: user.id,
      username: baseUserDisplayName,
      avatarUrl: profileAvatarUrl,
      updatedAt: new Date().toISOString(),
    });
  }, [baseUserDisplayName, profileAvatarUrl, upsertLiveProfile, user?.id]);

  // ── UI / workspace state ──────────────────────────────────────────────────
  const workspaceMode = useUiStore((state) => state.workspaceMode);
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );

  // ── Community workspace (nexus-backed) ─────────────────────────────────────
  const core = useHavenCore();
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = core.channels.useActiveChannelId();
  const setCurrentServerId = useCallback(
    (id: string | null) => {
      core.communities.setActiveId(id);
    },
    [core],
  );
  const setCurrentChannelId = useCallback(
    (id: string | null) => {
      core.channels.setActiveChannelId(id);
    },
    [core],
  );
  const setCommunityNavigation = useCallback(
    (serverId: string | null, channelId: string | null) => {
      core.communities.setActiveId(serverId);
      core.channels.setActiveChannelId(channelId);
    },
    [core],
  );

  const havenChannels = core.channels.useChannels(currentServerId ?? "__none__");
  const channelsLoading = core.channels.useIsLoading(currentServerId ?? "__none__");
  const channels = useMemo(
    () => havenChannels.map(toChannel),
    [havenChannels],
  );
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const reportStatusRefreshVersion = useUiStore(
    (state) => state.reportStatusRevision,
  );

  useEffect(() => {
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [servers, currentServerId, setCurrentServerId]);

  useEffect(() => {
    if (!currentServerId) return;
    setChannelsError(null);
    void core.channels.ensureLoaded(currentServerId).catch((err) => {
      console.warn("[useChatAppOrchestration] ensureLoaded failed", err);
      setChannelsError(
        err instanceof Error ? err.message : "Failed to load channels.",
      );
    });
  }, [core, currentServerId]);

  useEffect(() => {
    if (!currentServerId || channels.length === 0) return;
    const valid =
      currentChannelId != null &&
      channels.some((channel) => channel.id === currentChannelId);
    if (valid) return;
    const preferred = resolvePreferredChannelIdForServer(
      core,
      currentServerId,
      channels,
      { previousChannelId: currentChannelId },
    );
    setCommunityNavigation(currentServerId, preferred);
  }, [
    channels,
    core,
    currentChannelId,
    currentServerId,
    setCommunityNavigation,
  ]);

  useEffect(() => {
    if (!user?.id || !currentServerId) {
      if (currentServerId) {
        core.permissions.invalidate(currentServerId);
      }
      return;
    }
    void hydrateCommunityPermissions(currentServerId);
  }, [core, currentServerId, user?.id]);

  const channelSettingsTargetId = useUiStore(
    (state) => state.channelSettingsTargetId,
  );

  const currentServer = useMemo(
    () => servers.find((server) => server.id === currentServerId) ?? null,
    [servers, currentServerId],
  );

  const currentChannel = useMemo(
    () => channels.find((channel) => channel.id === currentChannelId) ?? null,
    [channels, currentChannelId],
  );

  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel &&
      currentServerId &&
      currentChannel.community_id === currentServerId,
  );

  const channelSettingsTarget = useMemo(
    () =>
      channels.find(
        (channel) =>
          channel.id === (channelSettingsTargetId ?? currentChannelId),
      ) ?? null,
    [channels, channelSettingsTargetId, currentChannelId],
  );

  const currentRenderableChannel = useMemo(
    () =>
      currentChannel &&
      currentChannelBelongsToCurrentServer &&
      currentChannel.kind === "text"
        ? currentChannel
        : (channels.find(
            (channel) =>
              channel.kind === "text" &&
              (!currentServerId || channel.community_id === currentServerId),
          ) ?? (currentChannelBelongsToCurrentServer ? currentChannel : null)),
    [
      channels,
      currentChannel,
      currentChannelBelongsToCurrentServer,
      currentServerId,
    ],
  );

  const currentChannelKind = currentChannel?.kind ?? null;

  const resetChannelsWorkspace = useCallback(() => {
    setChannelsError(null);
    if (currentServerId) {
      core.channels.setActiveChannelId(null);
    }
  }, [core, currentServerId]);

  const prefetchServersChannels = useCallback(
    async (serverIds: string[]) => {
      await Promise.allSettled(
        serverIds.map((id) => core.channels.ensureLoaded(id)),
      );
    },
    [core],
  );

  const PREFETCH_TEXT_CHANNELS_PER_SERVER = 8;

  const prefetchMessageCachesForServers = useCallback(
    async (
      serverIds: string[],
      prefetchChannelMessages: (
        serverId: string,
        channelId: string,
      ) => Promise<void>,
    ) => {
      await Promise.allSettled(
        serverIds.flatMap((serverId) => {
          const list = core.channels.getChannelsSnapshot(serverId);
          return list
            .filter((channel) => channel.kind === "text")
            .slice(0, PREFETCH_TEXT_CHANNELS_PER_SERVER)
            .map((channel) => prefetchChannelMessages(serverId, channel.id));
        }),
      );
    },
    [core],
  );

  const getDefaultChannelIdForServer = useCallback(
    (serverId: string, lastVisitedChannelId?: string | null): string | null => {
      const channelList = core.channels
        .getChannelsSnapshot(serverId)
        .map(toChannel);
      if (channelList.length === 0) return null;
      return resolvePreferredChannelIdForServer(core, serverId, channelList, {
        lastVisitedChannelId,
      });
    },
    [core],
  );

  const dmWorkspaceIsActive = workspaceMode === "dm";

  const {
    serverPermissions,
    canOpenServerSettings,
    canManageCurrentServer,
  } = useCurrentServerPermissionUi(currentServerId);

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
    derived: {
      activeVoiceChannel,
      voiceChannelParticipants,
      activeVoiceParticipantCount,
    },
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

  const friendsPanelOpen = useUiStore((state) => state.friendsPanelOpen);
  const friendsPanelRequestedTab = useUiStore(
    (state) => state.friendsPanelRequestedTab,
  );
  const friendsPanelHighlightedRequestId = useUiStore(
    (state) => state.friendsPanelHighlightedRequestId,
  );
  const setFriendsPanelOpen = useUiStore((state) => state.setFriendsPanelOpen);
  const setFriendsPanelRequestedTab = useUiStore(
    (state) => state.setFriendsPanelRequestedTab,
  );
  const setFriendsPanelHighlightedRequestId = useUiStore(
    (state) => state.setFriendsPanelHighlightedRequestId,
  );
  const socialCounts = core.social.useCounts();
  const refreshSocialCounts = useCallback(async () => {
    await core.social.load();
  }, [core]);
  const resetSocialWorkspace = useCallback(() => {
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
  }, [
    setFriendsPanelHighlightedRequestId,
    setFriendsPanelOpen,
    setFriendsPanelRequestedTab,
  ]);

  // ── Channel groups ────────────────────────────────────────────────────────
  const {
    state: { channelGroupState },
    derived: { sidebarChannelGroups },
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
  });

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
      membersModalCanManageMembers,
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
    canManageInvites: serverPermissions.canManageInvites,
    refreshServers,
    onActiveServerRemoved: () => {
      const ui = useUiStore.getState();
      ui.setShowServerSettingsModal(false);
      ui.setShowChannelSettingsModal(false);
      ui.setChannelSettingsTargetId(null);
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
    channels,
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  const messageNexus = useMemo(
    () => (currentServerId ? core.messages.for(currentServerId) : null),
    [core, currentServerId],
  );
  const visibleChannelMessages =
    messageNexus?.useVisibleChannel(currentChannelId ?? "__none__") ?? [];

  const {
    state: {
      hasOlderMessages,
      isLoadingOlderMessages,
    },
    actions: {
      resetMessageState,
      clearAuthorProfileCache,
      clearCrossSessionMessagingCaches,
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
      applyChannelAccessRevokedContentVisibility,
    },
  } = useMessages({
    currentServerId,
    currentChannelId,
    currentUserId: user?.id ?? null,
    isCurrentUserElevatedInServer: isCurrentUserElevatedInCurrentServer,
    debugChannelReloads,
    channels,
  });

  const { showVoiceDisconnectToast } =
    useChatAppAccessAndBroadcastOrchestration({
      servers,
      currentServer,
      currentServerId,
      channels,
      userId: user?.id,
      setWorkspaceMode,
      setCurrentChannelId,
      resetMessageState,
      resetChannelGroups,
      resetChannelsWorkspace,
      purgeMessageBundleCacheForServer,
      purgeMessageBundleCacheForChannel,
      applyChannelAccessRevokedContentVisibility,
      activeVoiceChannel,
      forceDisconnectVoice,
      serverNameByIdRef,
    });

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

  // ─── Notifications ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
    userId: user?.id,
    audioSettings: appSettings.notifications,
    autoMarkSeenOnPanelOpen: false,
  });

  // ── Social / Friends ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
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
    derived: { showDmWorkspace, selectedDmConversation },
    actions: {
      resetDirectMessages,
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
    userId: user?.id,
    enabled: true,
    isActive: dmWorkspaceIsActive,
  });

  // ── DM interactions ───────────────────────────────────────────────────────
  const {
    actions: {
      openDirectMessagesWorkspace,
      directMessageUser,
      blockDirectMessageUser,
    },
  } = useDirectMessageInteractions({
    currentUserId: user?.id,
    setDmConversationsError,
    refreshDmConversations,
    openDirectMessageWithUser,
    socialBackend,
    refreshSocialCounts,
    refreshNotificationInbox,
    onOpenDmWorkspace: () => {
      setWorkspaceMode("dm");
      setNotificationsPanelOpen(false);
      setFriendsPanelOpen(false);
      setFriendsPanelRequestedTab(null);
      setFriendsPanelHighlightedRequestId(null);
    },
    onEnterDmWorkspace: () => {
      setWorkspaceMode("dm");
    },
    onOpenFriendsAddPanel: () => {
      setFriendsPanelRequestedTab("add");
      setFriendsPanelHighlightedRequestId(null);
      setFriendsPanelOpen(true);
    },
  });

  // ── Notification interactions ─────────────────────────────────────────────
  useChatAppElevationEffects({
    currentServerId,
    userId: user?.id,
    activeVoiceCommunityId: activeVoiceChannel?.community_id ?? null,
    membersModalCommunityId,
    setIsCurrentUserElevatedInCurrentServer,
    setIsCurrentUserElevatedInActiveVoiceServer,
    setIsCurrentUserElevatedInMembersModalServer,
  });

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
    refreshNotificationInbox,
    refreshSocialCounts,
    setNotificationsError,
    onOpenDmConversation: async (conversationId) => {
      setWorkspaceMode("dm");
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
      setWorkspaceMode("community");
      setCurrentServerId(communityId);
      setCurrentChannelId(channelId);
      setNotificationsPanelOpen(false);
    },
  });

  const {
    joinServerByInvite,
    saveAttachment,
    reportUserProfile,
    banUserFromServer,
    kickUserFromServer,
    saveMemberChannelPermissions,
    resolveBanEligibleServers,
    saveAccountSettings,
    saveThemePreference,
  } = useChatAppBusinessActions({
    user,
    currentServerId,
    showServerSettingsModal,
    controlPlaneBackend,
    refreshServers,
    setCurrentServerId,
    refreshMembersModalMembersIfOpen,
    loadCommunityBans,
    saveMemberChannelPermissionsRaw,
    applyChannelAccessRevokedContentVisibility,
    applyLocalProfileUpdate,
    upsertLiveProfile,
    profileUsername,
    profileAvatarUrl,
  });

  // ── Deep links ────────────────────────────────────────────────────────────
  useDeepLinks({
    user,
    joinServerByInvite,
    openDirectMessageConversation,
    setNotificationsPanelOpen,
    setFriendsPanelOpen,
    setFriendsPanelRequestedTab,
    setFriendsPanelHighlightedRequestId,
  });

  const {
    handleLeaveServer,
    handleDeleteServer,
    handleRenameServer,
    handleRenameChannel,
    handleDeleteChannel,
    handleCreateChannelGroup,
    handleRenameChannelGroup,
    handleDeleteChannelGroup,
    confirmPendingUiAction,
  } = useChatAppConfirmationHandlers({
    servers,
    channels,
    channelGroupStateGroups: channelGroupState.groups,
    leaveServer,
    deleteServer,
    deleteChannel,
    deleteChannelGroup,
  });

  useChatAppLifecycleEffects({
    user,
    serverModmailEnabled,
    currentServerId,
    userId: user?.id,
    servers,
    setNotificationsPanelOpen,
    setFriendsPanelOpen,
    setWorkspaceMode,
    resetPlatformSession,
    resetVoiceState,
    resetMessageState,
    clearAuthorProfileCache,
    clearCrossSessionMessagingCaches,
    resetFeatureFlags,
    resetNotifications,
    resetSocialWorkspace,
    resetDirectMessages,
    resetChannelsWorkspace,
    resetServerSettingsState,
    resetServerInvites,
    resetServerRoleManagement,
    resetChannelPermissionsState,
    resetChannelGroups,
    resetMembersModal,
    resetCommunityBans,
    prefetchServersChannels,
    prefetchMessageCachesForServers,
    prefetchChannelMessages,
  });

  useShellThemeSync({
    profileThemeId,
    featureFlags,
    featureFlagsLoaded,
    userId: user?.id,
  });

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // auth
    user,
    authStatus,
    authError,
    passwordRecoveryRequired,
    completePasswordRecovery,
    signOut,
    deleteAccount,
    // servers
    servers,
    serversStatus,
    serversError,
    isServersLoading,
    createServer,
    // session / profile
    profileUsername,
    profileAvatarUrl,
    profileThemeId,
    isPlatformStaff,
    userDisplayName,
    baseUserDisplayName,
    applyLocalProfileUpdate,
    userStatus,
    setUserStatus,
    rainbowMode,
    setRainbowMode,
    // feature flags
    hasFeatureFlag,
    featureFlags,
    featureFlagsLoaded,
    dmWorkspaceIsActive,
    serverModmailEnabled,
    voiceHardwareDebugPanelEnabled,
    richComposerEnabled,
    // community
    channels,
    channelsLoading,
    channelsError,
    managedReportServerIds,
    currentChannel,
    channelSettingsTarget,
    currentRenderableChannel,
    currentChannelKind,
    canOpenServerSettings,
    canManageCurrentServer,
    isCurrentUserElevatedInCurrentServer,
    isCurrentUserElevatedInMembersModalServer,
    reportStatusRefreshVersion,
    // voice
    activeVoiceChannelId,
    voicePanelOpen,
    voiceHardwareDebugPanelOpen,
    voiceControlActions,
    voiceJoinPrompt,
    activeVoiceChannel,
    voiceChannelParticipants,
    isCurrentUserElevatedInActiveVoiceServer,
    setVoicePanelOpen,
    setVoiceHardwareDebugPanelOpen,
    setVoiceControlActions,
    requestVoiceChannelJoin,
    confirmVoiceChannelJoin,
    cancelVoiceChannelJoinPrompt,
    disconnectVoiceSession,
    forceDisconnectVoice,
    showVoiceDisconnectToast,
    // channel groups
    channelGroupState,
    sidebarChannelGroups,
    createChannelGroup,
    assignChannelToGroup,
    removeChannelFromGroup,
    setChannelGroupCollapsed,
    renameChannelGroup,
    deleteChannelGroup,
    // server admin
    showMembersModal,
    membersModalCommunityId,
    membersModalServerName,
    membersModalMembers,
    membersModalLoading,
    membersModalError,
    membersModalCanCreateReports,
    membersModalCanManageMembers,
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
    closeMembersModal,
    openServerMembersModal,
    createServerInvite,
    revokeServerInvite,
    createServerRole,
    updateServerRole,
    deleteServerRole,
    saveServerRolePermissions,
    saveServerMemberRoles,
    saveServerSettings,
    openServerSettingsModal,
    leaveServer,
    renameServer,
    loadCommunityBans,
    unbanUserFromCurrentServer,
    // channel management
    channelRolePermissions,
    channelMemberPermissions,
    channelPermissionMemberOptions,
    channelPermissionsLoading,
    channelPermissionsLoadError,
    createChannel,
    saveChannelSettings,
    renameChannel,
    deleteChannel,
    deleteCurrentChannel,
    openChannelSettingsModal,
    saveRoleChannelPermissions,
    saveMemberChannelPermissions,
    visibleChannelMessages,
    hasOlderMessages,
    isLoadingOlderMessages,
    requestOlderMessages,
    sendMessage,
    toggleMessageReaction,
    editMessage,
    deleteMessage,
    reportMessage,
    requestMessageLinkPreviewRefresh,
    // desktop settings
    appSettings,
    appSettingsLoading,
    updaterStatus,
    updaterStatusLoading,
    checkingForUpdates,
    notificationAudioSettingsSaving,
    notificationAudioSettingsError,
    voiceSettingsSaving,
    voiceSettingsError,
    setAutoUpdateEnabled,
    setNotificationAudioSettings,
    setVoiceSettings,
    checkForUpdatesNow,
    // notifications
    notificationItems,
    notificationCounts,
    notificationsLoading,
    notificationsRefreshing,
    notificationsError,
    notificationPreferences,
    notificationPreferencesLoading,
    notificationPreferencesSaving,
    notificationPreferencesError,
    refreshNotificationsManually,
    markAllNotificationsSeen,
    markNotificationRead,
    dismissNotification,
    dismissAllNotifications,
    saveNotificationPreferences,
    openNotificationItem,
    acceptFriendRequestFromNotification,
    declineFriendRequestFromNotification,
    dismissFriendRequestNotification,
    // social
    friendsPanelOpen,
    setFriendsPanelOpen,
    friendsPanelRequestedTab,
    setFriendsPanelRequestedTab,
    friendsPanelHighlightedRequestId,
    setFriendsPanelHighlightedRequestId,
    socialCounts,
    directMessageUser,
    blockDirectMessageUser,
    openDirectMessagesWorkspace,
    // direct messages
    dmConversations,
    dmConversationsLoading,
    dmConversationsRefreshing,
    dmConversationsError,
    selectedDmConversationId,
    selectedDmConversation,
    dmMessages,
    dmMessagesLoading,
    dmMessagesRefreshing,
    dmMessagesError,
    dmMessageSendPending,
    showDmWorkspace,
    refreshDmConversations,
    refreshDmMessages,
    sendDirectMessage,
    toggleSelectedDmConversationMuted,
    reportDirectMessage,
    openDirectMessageConversation,
    setSelectedDmConversationId,
    confirmPendingUiAction,
    // handle functions
    handleLeaveServer,
    handleDeleteServer,
    handleRenameServer,
    handleRenameChannel,
    handleDeleteChannel,
    handleCreateChannelGroup,
    handleRenameChannelGroup,
    handleDeleteChannelGroup,
    // business actions
    joinServerByInvite,
    saveAttachment,
    reportUserProfile,
    banUserFromServer,
    kickUserFromServer,
    resolveBanEligibleServers,
    saveAccountSettings,
    saveThemePreference,
    // cache helpers
    getDefaultChannelIdForServer,
    // misc
    getPlatformInviteBaseUrl,
  };
}

export type ChatAppOrchestrationApi = ReturnType<typeof useChatAppOrchestration>;
