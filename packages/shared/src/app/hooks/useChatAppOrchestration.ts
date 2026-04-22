import { useEffect, useRef, useState } from "react";
import { useAuth } from "@shared/contexts/AuthContext";
import { useServers } from "@shared/features/community/hooks/useServers";
import {
  getControlPlaneBackend,
  getDirectMessageBackend,
  getNotificationBackend,
  getSocialBackend,
} from "@shared/lib/backend";
import { getPlatformInviteBaseUrl } from "@platform/urls";
import {
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
} from "@shared/app/constants";
import type { FriendsPanelTab } from "@shared/app/types";
import { useDesktopSettings } from "@shared/app/hooks/useDesktopSettings";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useServerAdmin } from "@shared/features/community/hooks/useServerAdmin";
import { useChannelManagement } from "@shared/features/community/hooks/useChannelManagement";
import { useChannelGroups } from "@shared/features/community/hooks/useChannelGroups";
import { useCurrentServerPermissionUi } from "@shared/features/community/hooks/useCurrentServerPermissionUi";
import { useMessages } from "@shared/features/messaging/hooks/useMessages";
import { useNotifications } from "@shared/features/notifications/hooks/useNotifications";
import { useNotificationInteractions } from "@shared/features/notifications/hooks/useNotificationInteractions";
import { useDeepLinks } from "@shared/app/hooks/useDeepLinks";
import { useSocialWorkspace } from "@shared/features/social/hooks/useSocialWorkspace";
import { useDirectMessages } from "@shared/features/direct-messages/hooks/useDirectMessages";
import { useDirectMessageInteractions } from "@shared/features/direct-messages/hooks/useDirectMessageInteractions";
import { useVoice } from "@shared/features/voice/hooks/useVoice";
import { useFeatureFlags } from "@shared/app/hooks/useFeatureFlags";
import { useLiveProfiles } from "@shared/features/profile/hooks/useLiveProfiles";
import { usePlatformSession } from "@shared/features/profile/hooks/usePlatformSession";
import { useServersStore } from "@shared/stores/serversStore";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import { useUiStore } from "@shared/stores/uiStore";
import { usePermissionsReportSlice } from "@shared/app/chat-app/controllers/usePermissionsReportSlice";
import { useChatAppAccessAndBroadcastOrchestration } from "@shared/app/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration";
import { useChatAppElevationEffects } from "@shared/app/chat-app/controllers/useChatAppElevationEffects";
import { useChatAppBusinessActions } from "@shared/app/chat-app/controllers/useChatAppBusinessActions";
import { useChatAppConfirmationHandlers } from "@shared/app/chat-app/controllers/useChatAppConfirmationHandlers";
import { useChatAppLifecycleEffects } from "@shared/app/chat-app/controllers/useChatAppLifecycleEffects";

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
  } = useServers();
  const isServersLoading = serversStatus === "loading";

  const { managedReportServerIds, serverModmailEnabled } =
    usePermissionsReportSlice(user?.id, servers);

  // ── Feature flags ─────────────────────────────────────────────────────────
  const {
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
    state: { profileUsername, profileAvatarUrl, isPlatformStaff },
    actions: { resetPlatformSession, applyLocalProfileUpdate },
  } = usePlatformSession({
    controlPlaneBackend,
    userId: user?.id,
    userEmail: user?.email,
  });
  const notificationsPanelOpen = useNotificationsStore(
    (state) => state.isPanelOpen,
  );
  const setNotificationsPanelOpen = useNotificationsStore(
    (state) => state.setIsPanelOpen,
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
  const workspaceMode = useNavigationStore((state) => state.workspaceMode);
  const setWorkspaceMode = useNavigationStore(
    (state) => state.setWorkspaceMode,
  );
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );

  // ── Community workspace ───────────────────────────────────────────────────
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setCurrentServerId = useNavigationStore(
    (state) => state.setCurrentServerId,
  );
  const {
    serverPermissions,
    canOpenServerSettings,
    canManageCurrentServer,
  } = useCurrentServerPermissionUi(currentServerId);
  const currentChannelId = useNavigationStore(
    (state) => state.currentChannelId,
  );
  const setCurrentChannelId = useNavigationStore(
    (state) => state.setCurrentChannelId,
  );
  const {
    state: { channels, channelsLoading, channelsError },
    derived: {
      currentServer,
      currentChannel,
      channelSettingsTarget,
      currentRenderableChannel,
      currentChannelKind,
      reportStatusRefreshVersion,
    },
    actions: {
      resetChannelsWorkspace,
      setChannels,
      prefetchServersChannels,
      prefetchMessageCachesForServers,
      getDefaultChannelIdForServer,
    },
  } = useCommunityWorkspace({
    servers,
    currentUserId: user?.id ?? null,
  });

  const dmWorkspaceIsActive = workspaceMode === "dm";

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
    enabled: true,
  });

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
    setChannels,
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  const {
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
    notificationBackend,
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
    directMessageBackend,
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
    setCurrentServerId,
    setCurrentChannelId,
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
    // cache helpers
    getDefaultChannelIdForServer,
    // misc
    getPlatformInviteBaseUrl,
  };
}

export type ChatAppOrchestrationApi = ReturnType<typeof useChatAppOrchestration>;
