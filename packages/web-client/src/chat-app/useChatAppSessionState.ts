import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@shared/contexts/AuthContext";
import {
  useHavenCore,
  toChannel,
  resolvePreferredChannelIdForServer,
  toServerSummaries,
  deriveCommunitiesLoadStatus,
  bootstrapNotificationSoundSync,
  createNotificationSoundSyncState,
  resetNotificationSoundSyncState,
  syncNotificationSounds,
} from "@shared/core";
import { hydrateCommunityPermissions } from "@shared/features/community/utils/communityPermissionsHydration";
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
import { getErrorMessage } from "@platform/lib/errors";
import { useDesktopSettings } from "@web-client/hooks/useDesktopSettings";
import { useDeepLinks } from "@web-client/hooks/useDeepLinks";
import { useDirectMessageInteractions } from "@shared/features/direct-messages/hooks/useDirectMessageInteractions";
import { useNotificationInteractions } from "@shared/features/notifications/hooks/useNotificationInteractions";
import { useVoice } from "@shared/features/voice/hooks/useVoice";
import { useFeatureFlags } from "@shared/infrastructure/useFeatureFlags";
import { usePlatformSession } from "@shared/features/profile/hooks/usePlatformSession";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import { useUiStore } from "@shared/stores/uiStore";
import { useChatAppAccessAndBroadcastOrchestration } from "@web-client/chat-app/controllers/useChatAppAccessAndBroadcastOrchestration";
import { useChatAppElevationEffects } from "@web-client/chat-app/controllers/useChatAppElevationEffects";
import { useChatAppBusinessActions } from "@web-client/chat-app/controllers/useChatAppBusinessActions";
import { useChatAppConfirmationHandlers } from "@web-client/chat-app/controllers/useChatAppConfirmationHandlers";
import { useChatAppLifecycleEffects } from "@web-client/chat-app/controllers/useChatAppLifecycleEffects";
import { useShellThemeSync } from "@web-client/hooks/useShellThemeSync";

export function useChatAppSessionState() {
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

  const core = useHavenCore();

  // ── Servers ───────────────────────────────────────────────────────────────
  const nexusCommunities = core.communities.useCommunities();
  const servers = useMemo(
    () => toServerSummaries(nexusCommunities),
    [nexusCommunities],
  );
  const serversLoadError = core.communities.useLoadError();
  const isServersLoading = core.communities.useIsLoading();
  const serversStatus = deriveCommunitiesLoadStatus({
    hasUser: Boolean(user?.id),
    isLoading: isServersLoading,
    loadError: serversLoadError,
    communityCount: nexusCommunities.length,
  });
  const serversError = serversLoadError;

  const refreshServers = useCallback(async () => {
    if (!user?.id) return;
    await core.refreshCommunities(user.id);
  }, [core, user?.id]);

  const createServer = useCallback(
    async (name: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      return core.createCommunity(user.id, name);
    },
    [core, user?.id],
  );

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

  const permissionsByCommunityId = core.permissions.usePermissionsByCommunityId();
  const managedReportServerIds = useMemo(
    () =>
      servers
        .filter(
          (server) => permissionsByCommunityId[server.id]?.canManageReports,
        )
        .map((server) => server.id),
    [permissionsByCommunityId, servers],
  );
  const serverModmailEnabled = managedReportServerIds.length > 0;

  useEffect(() => {
    if (!user?.id) return;
    core.profiles.upsertProfile({
      userId: user.id,
      username: baseUserDisplayName,
      avatarUrl: profileAvatarUrl,
      updatedAt: new Date().toISOString(),
    });
  }, [baseUserDisplayName, core.profiles, profileAvatarUrl, user?.id]);

  const upsertLiveProfile = useCallback(
    (input: {
      userId: string;
      username: string;
      avatarUrl: string | null;
      updatedAt: string;
    }) => {
      core.profiles.upsertProfile(input);
    },
    [core.profiles],
  );

  // ── UI / workspace state ──────────────────────────────────────────────────
  const workspaceMode = useUiStore((state) => state.workspaceMode);
  const setWorkspaceMode = useUiStore((state) => state.setWorkspaceMode);
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );

  // ── Community workspace (nexus-backed) ─────────────────────────────────────
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


  useEffect(() => {
    if (!user?.id || servers.length === 0 || currentServerId) return;
    setCurrentServerId(servers[0].id);
  }, [servers, currentServerId, setCurrentServerId, user?.id]);

  useEffect(() => {
    if (!user?.id || !currentServerId) return;
    void hydrateCommunityPermissions(currentServerId);
  }, [currentServerId, user?.id]);

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
      channels.some(
        (channel) =>
          channel.id === currentChannelId &&
          channel.community_id === currentServerId,
      );
    if (valid) return;
    const preferred = resolvePreferredChannelIdForServer(
      core,
      currentServerId,
      channels,
      { previousChannelId: currentChannelId },
    );
    if (preferred === currentChannelId) return;
    setCommunityNavigation(currentServerId, preferred);
  }, [
    channels,
    core,
    currentChannelId,
    currentServerId,
    setCommunityNavigation,
  ]);

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

  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;
  const canManageCurrentServer =
    serverPermissions.isOwner || serverPermissions.canManageServer;

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
  const channelGroupState = core.channels.useChannelGroups(currentServerId ?? "");
  const sidebarChannelGroups = useMemo(
    () =>
      channelGroupState.groups.map((group) => ({
        id: group.id,
        name: group.name,
        channelIds: group.channelIds,
        isCollapsed: channelGroupState.collapsedGroupIds.includes(group.id),
      })),
    [channelGroupState.collapsedGroupIds, channelGroupState.groups],
  );

  const resetChannelGroups = useCallback(() => {
    if (!currentServerId) return;
    void core.channels.loadForCommunity(currentServerId);
  }, [core.channels, currentServerId]);

  const createChannelGroup = useCallback(
    async (name: string, channelIdToAssign?: string | null) => {
      if (!currentServerId || !user?.id) throw new Error("No server selected.");
      await core.channels.createChannelGroup(
        currentServerId,
        name,
        user.id,
        channelIdToAssign,
      );
    },
    [core.channels, currentServerId, user?.id],
  );

  const assignChannelToGroup = useCallback(
    async (channelId: string, groupId: string) => {
      if (!currentServerId) throw new Error("No server selected.");
      await core.channels.assignChannelToGroup(currentServerId, channelId, groupId);
    },
    [core.channels, currentServerId],
  );

  const removeChannelFromGroup = useCallback(
    async (channelId: string) => {
      if (!currentServerId) throw new Error("No server selected.");
      await core.channels.removeChannelFromGroup(currentServerId, channelId);
    },
    [core.channels, currentServerId],
  );

  const setChannelGroupCollapsed = useCallback(
    async (groupId: string, isCollapsed: boolean) => {
      if (!currentServerId) throw new Error("No server selected.");
      await core.channels.setChannelGroupCollapsed(
        currentServerId,
        groupId,
        isCollapsed,
      );
    },
    [core.channels, currentServerId],
  );

  const renameChannelGroup = useCallback(
    async (groupId: string, name: string) => {
      if (!currentServerId) throw new Error("No server selected.");
      await core.channels.renameChannelGroup(currentServerId, groupId, name);
    },
    [core.channels, currentServerId],
  );

  const deleteChannelGroup = useCallback(
    async (groupId: string) => {
      if (!currentServerId) throw new Error("No server selected.");
      await core.channels.deleteChannelGroup(currentServerId, groupId);
    },
    [core.channels, currentServerId],
  );

  const admin = core.admin;

  const resetMessageState = useCallback(() => {}, []);

  const prefetchChannelMessages = useCallback(
    async (serverId: string, channelId: string) => {
      await core.messages.for(serverId).ensureInitialLoaded(channelId, {
        freshnessMs: 0,
      });
    },
    [core],
  );

  const purgeMessageBundleCacheForServer = useCallback(
    (targetCommunityId: string) => core.messages.clearCommunity(targetCommunityId),
    [core],
  );

  const purgeMessageBundleCacheForChannel = useCallback(
    (targetCommunityId: string, channelId: string) => {
      core.messages.for(targetCommunityId).evictChannel(channelId);
    },
    [core],
  );

  const applyChannelAccessRevokedContentVisibility = useCallback(
    (input: { communityId: string; channelId: string; revokedUserId: string }) => {
      core.permissions.appendRevokedAuthorId(
        input.communityId,
        input.channelId,
        input.revokedUserId,
      );
    },
    [core],
  );

  const clearAuthorProfileCache = useCallback(() => {}, []);
  const clearCrossSessionMessagingCaches = useCallback(() => {}, []);

  const [dmConversationsError, setDmConversationsError] = useState<string | null>(
    null,
  );

  const refreshDmConversations = useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      void options;
      if (!user?.id) return;
      setDmConversationsError(null);
      try {
        await core.directMessages.loadConversations();
      } catch (error) {
        setDmConversationsError(
          getErrorMessage(error, "Failed to load direct messages."),
        );
      }
    },
    [core.directMessages, user?.id],
  );

  const openDirectMessageConversation = useCallback(
    async (conversationId: string) => {
      if (!user?.id) throw new Error("Not authenticated.");
      setDmConversationsError(null);
      await core.directMessages.openConversation(conversationId, { markRead: true });
    },
    [core.directMessages, user?.id],
  );

  const openDirectMessageWithUser = useCallback(
    async (targetUserId: string) => {
      if (!user?.id) throw new Error("Not authenticated.");
      setWorkspaceMode("dm");
      await core.directMessages.openWithUser(targetUserId);
    },
    [core.directMessages, setWorkspaceMode, user?.id],
  );

  const resetDirectMessages = useCallback(() => {
    core.directMessages.clearFocusedConversation();
    setDmConversationsError(null);
  }, [core.directMessages]);

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

  const notificationSoundSyncRef = useRef(createNotificationSoundSyncState());
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const notificationItems = core.notifications.useNotifications();

  const refreshNotificationInbox = useCallback(async () => {
    if (!user?.id) return;
    await core.notifications.refreshInbox();
  }, [core.notifications, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      resetNotificationSoundSyncState(notificationSoundSyncRef.current);
      return;
    }
    void bootstrapNotificationSoundSync(core, notificationSoundSyncRef.current);
  }, [core, user?.id]);

  useEffect(() => {
    if (!user?.id || !notificationSoundSyncRef.current.bootstrapped) return;
    void syncNotificationSounds(
      core,
      appSettings.notifications,
      notificationSoundSyncRef.current,
    ).catch((error) => {
      console.error("Failed to play notification sounds:", error);
    });
  }, [appSettings.notifications, core, notificationItems.length, user?.id]);

  const resetNotifications = useCallback(() => {
    setNotificationsError(null);
    core.notifications.setPreferences(null);
    resetNotificationSoundSyncState(notificationSoundSyncRef.current);
  }, [core.notifications]);

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
    resetServerSettingsState: admin.resetServerSettingsState,
    resetServerInvites: admin.resetServerInvites,
    resetServerRoleManagement: admin.resetServerRoleManagement,
    resetChannelPermissionsState: admin.resetChannelPermissionsState,
    resetChannelGroups,
    resetMembersModal: admin.resetMembersModal,
    resetCommunityBans: admin.resetCommunityBans,
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
    saveMemberChannelPermissions,
    resolveBanEligibleServers,
    saveAccountSettings,
    saveThemePreference,
    // cache helpers
    getDefaultChannelIdForServer,
    // misc
    getPlatformInviteBaseUrl,
  };
}

export type ChatAppSessionState = ReturnType<typeof useChatAppSessionState>;
