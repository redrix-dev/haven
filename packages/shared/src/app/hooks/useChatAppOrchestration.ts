import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@shared/contexts/AuthContext";
import { useServers } from "@shared/features/community/hooks/useServers";
import {
  getCommunityDataBackend,
  getControlPlaneBackend,
  getDirectMessageBackend,
  getNotificationBackend,
  getSocialBackend,
} from "@shared/lib/backend";
import { desktopClient } from "@platform/desktop/client";
import { getPlatformInviteBaseUrl } from "@platform/urls";
import { getErrorMessage } from "@platform/lib/errors";
import { installPromptTrap } from "@shared/lib/contextMenu/debugTrace";
import {
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  FRIENDS_SOCIAL_PANEL_FLAG,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
} from "@shared/app/constants";
import type { FriendsPanelTab } from "@shared/app/types";
import { useDesktopSettings } from "@shared/app/hooks/useDesktopSettings";
import { useCommunityWorkspace } from "@shared/features/community/hooks/useCommunityWorkspace";
import { useServerAdmin } from "@shared/features/community/hooks/useServerAdmin";
import { useChannelManagement } from "@shared/features/community/hooks/useChannelManagement";
import { useChannelGroups } from "@shared/features/community/hooks/useChannelGroups";
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
import type {
  AuthorProfile,
  BanEligibleServer,
  MessageAttachment,
  MemberBannedBroadcastPayload,
  MemberChannelAccessRevokedBroadcastPayload,
  ServerPermissions,
} from "@shared/lib/backend/types";
import type { ForceDisconnectVoiceReason } from "@shared/features/voice/types";
import { useServersStore } from "@shared/stores/serversStore";
import { useUserStatusStore } from "@shared/stores/userStatusStore";
import { toast } from "sonner";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useNotificationsStore } from "@shared/stores/notificationsStore";
import { useUiStore } from "@shared/stores/uiStore";

// Pure utility — no hook deps, stable across renders.
const normalizeInviteCode = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const maybeFromPath = trimmed.split("?")[0].replace(/\/+$/, "");
  if (maybeFromPath.includes("/")) {
    const pathSegments = maybeFromPath.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment) return lastSegment.toUpperCase();
  }
  return maybeFromPath.toUpperCase();
};

export function useChatAppOrchestration() {
  const activeServerAccessLostHandlerRef = useRef<(serverId: string) => void>(
    () => {},
  );
  const activeChannelAccessLostHandlerRef = useRef<
    (channelId: string, channelName: string) => void
  >(() => {});
  const memberBannedHandlerRef = useRef<
    (payload: MemberBannedBroadcastPayload) => void
  >(() => {});
  const memberChannelAccessRevokedHandlerRef = useRef<
    (payload: MemberChannelAccessRevokedBroadcastPayload) => void
  >(() => {});
  const serverNameByIdRef = useRef<Record<string, string>>({});
  const elevatedServerAccessByIdRef = useRef<Map<string, boolean>>(new Map());
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
  const handleActiveServerAccessLost = useCallback((serverId: string) => {
    activeServerAccessLostHandlerRef.current(serverId);
  }, []);
  const handleActiveChannelAccessLost = useCallback(
    (channelId: string, channelName: string) => {
      activeChannelAccessLostHandlerRef.current(channelId, channelName);
    },
    [],
  );
  const handleMemberBanned = useCallback(
    (payload: MemberBannedBroadcastPayload) => {
      memberBannedHandlerRef.current(payload);
    },
    [],
  );
  const handleMemberChannelAccessRevoked = useCallback(
    (payload: MemberChannelAccessRevokedBroadcastPayload) => {
      memberChannelAccessRevokedHandlerRef.current(payload);
    },
    [],
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
  const isServersLoading = serversStatus === "loading";

  // ── Feature flags ─────────────────────────────────────────────────────────
  const {
    state: { featureFlagsLoaded },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({ controlPlaneBackend, userId: user?.id });

  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS ||
    hasFeatureFlag("debug_channel_reload_diagnostics");
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(
    VOICE_HARDWARE_DEBUG_PANEL_FLAG,
  );
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;

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
  const [serverReportPermissionsById, setServerReportPermissionsById] =
    useState<Record<string, ServerPermissions>>({});

  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );

  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});

  // ── Community workspace ───────────────────────────────────────────────────
  const currentServerId = useNavigationStore((state) => state.currentServerId);
  const setCurrentServerId = useNavigationStore(
    (state) => state.setCurrentServerId,
  );
  const serverPermissions = usePermissionsStore((state) =>
    state.getPermissions(currentServerId ?? ""),
  );
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
      getDefaultChannelIdForServer,
    },
  } = useCommunityWorkspace({
    servers,
    currentUserId: user?.id ?? null,
    onMemberBanned: handleMemberBanned,
    onMemberChannelAccessRevoked: handleMemberChannelAccessRevoked,
  });

  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites;
  const canManageCurrentServer =
    serverPermissions.isOwner || serverPermissions.canManageServer;

  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === "dm";
  const managedReportServerIds = servers
    .filter(
      (server) => serverReportPermissionsById[server.id]?.canManageReports,
    )
    .map((server) => server.id);
  const serverModmailEnabled = managedReportServerIds.length > 0;

  useEffect(() => {
    let isMounted = true;

    if (!user?.id || servers.length === 0) {
      setServerReportPermissionsById({});
      return () => {
        isMounted = false;
      };
    }

    void (async () => {
      const permissionResults = await Promise.allSettled(
        servers.map(async (server) => {
          const communityBackend = getCommunityDataBackend(server.id);
          const permissions = await communityBackend.fetchServerPermissions(
            server.id,
          );
          return [server.id, permissions] as const;
        }),
      );

      if (!isMounted) return;

      const nextPermissionsById: Record<string, ServerPermissions> = {};
      for (const result of permissionResults) {
        if (result.status !== "fulfilled") continue;
        const [serverId, permissions] = result.value;
        nextPermissionsById[serverId] = permissions;
      }
      setServerReportPermissionsById(nextPermissionsById);
    })();

    return () => {
      isMounted = false;
    };
  }, [servers, user?.id]);

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
    enabled: friendsSocialPanelEnabled,
  });

  const ensureIsElevatedInServer = useCallback(
    async (communityId: string): Promise<boolean> => {
      if (!communityId || !user?.id) return false;
      const cachedValue = elevatedServerAccessByIdRef.current.get(communityId);
      if (typeof cachedValue === "boolean") {
        return cachedValue;
      }

      const communityBackend = getCommunityDataBackend(communityId);
      const nextValue = await communityBackend.isElevatedInServer(communityId);
      elevatedServerAccessByIdRef.current.set(communityId, nextValue);
      return nextValue;
    },
    [user?.id],
  );

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
    ensureIsElevatedInServer,
    debugChannelReloads,
    channels,
    authorProfileCacheRef,
  });

  const handleServerAccessLossReset = useCallback(
    (serverId: string) => {
      if (!serverId) return;
      useNavigationStore.getState().setCurrentServerId(null);
      useNavigationStore.getState().setCurrentServer(null);
      useNavigationStore.getState().setCurrentChannelId(null);
      useNavigationStore.getState().setWorkspaceMode("community");
      resetMessageState();
      resetChannelGroups();
      resetChannelsWorkspace();
      usePermissionsStore.getState().clearPermissions(serverId);
      purgeMessageBundleCacheForServer(serverId);
      setWorkspaceMode("community");
    },
    [
      purgeMessageBundleCacheForServer,
      resetChannelGroups,
      resetChannelsWorkspace,
      resetMessageState,
    ],
  );

  const disconnectVoiceForAccessLoss = useCallback(
    async (input: { serverId?: string; channelId?: string }) => {
      const activeChannel = activeVoiceChannel;
      if (!activeChannel) return;

      const losesServerAccess =
        Boolean(input.serverId) &&
        activeChannel.community_id === input.serverId;
      const losesChannelAccess =
        Boolean(input.channelId) && activeChannel.id === input.channelId;
      if (!losesServerAccess && !losesChannelAccess) return false;
      await forceDisconnectVoice("access_lost");
      return true;
    },
    [activeVoiceChannel, forceDisconnectVoice],
  );

  const showVoiceDisconnectToast = useCallback(
    (input: {
      reason: ForceDisconnectVoiceReason;
      accessScope?: "server" | "channel";
    }) => {
      let message = "You have been disconnected from voice.";
      switch (input.reason) {
        case "access_lost":
          message =
            input.accessScope === "channel"
              ? "You have been disconnected from voice. You no longer have access to this channel."
              : "You have been disconnected from voice. You no longer have access to this server.";
          break;
        case "kicked":
          message = "You have been removed from this voice channel.";
          break;
        case "ban":
          message = "You have been disconnected from voice.";
          break;
        default:
          break;
      }

      const toastId = `voice-disconnect:${input.reason}:${input.accessScope ?? "generic"}`;
      toast(message, {
        id: toastId,
        action: {
          label: "Dismiss",
          onClick: () => {
            toast.dismiss(toastId);
          },
        },
      });
    },
    [],
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
        "Unknown server";

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({
        serverId,
      });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({
          reason: "access_lost",
          accessScope: "server",
        });
      }
      handleServerAccessLossReset(serverId);

      const toastId = `server-access-lost:${serverId}`;
      toast(`You have been removed from ${lostServerName}.`, {
        id: toastId,
        action: {
          label: "Dismiss",
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
    ],
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
            channel.kind === "text" &&
            channel.id !== channelId,
        )?.id ?? null;

      const disconnectedFromVoice = await disconnectVoiceForAccessLoss({
        channelId,
      });
      if (disconnectedFromVoice) {
        showVoiceDisconnectToast({
          reason: "access_lost",
          accessScope: "channel",
        });
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
          });
        } catch (error) {
          console.error(
            "Failed to broadcast channel access revocation:",
            error,
          );
        }
      }
      purgeMessageBundleCacheForChannel(currentServerId, channelId);
      resetMessageState();
      setCurrentChannelId(nextChannelId);

      const toastId = `channel-access-lost:${currentServerId}:${channelId}`;
      toast(`Your access to #${channelName} has been revoked.`, {
        id: toastId,
        action: {
          label: "Dismiss",
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
    ],
  );

  activeChannelAccessLostHandlerRef.current = handleChannelAccessLostCascade;

  const handleMemberBannedBroadcast = useCallback(
    (payload: MemberBannedBroadcastPayload) => {
      if (!payload.communityId || !payload.bannedUserId) return;
      if (payload.bannedUserId === user?.id) return;
      // Hidden-message visibility now flows from server-side RLS on subsequent reads.
    },
    [user?.id],
  );

  memberBannedHandlerRef.current = handleMemberBannedBroadcast;

  const handleMemberChannelAccessRevokedBroadcast = useCallback(
    (payload: MemberChannelAccessRevokedBroadcastPayload) => {
      if (!payload.communityId || !payload.channelId || !payload.revokedUserId)
        return;
      if (payload.revokedUserId === user?.id) return;
      applyChannelAccessRevokedContentVisibility(payload);
    },
    [applyChannelAccessRevokedContentVisibility, user?.id],
  );

  memberChannelAccessRevokedHandlerRef.current =
    handleMemberChannelAccessRevokedBroadcast;

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
    enabled: dmWorkspaceEnabled,
    isActive: dmWorkspaceIsActive,
  });

  const showDmWorkspace = dmWorkspaceIsActive;
  const selectedDmConversation = selectedDmConversationId
    ? (dmConversations.find(
        (c) => c.conversationId === selectedDmConversationId,
      ) ?? null)
    : null;

  // ── DM interactions ───────────────────────────────────────────────────────
  const {
    actions: {
      openDirectMessagesWorkspace,
      directMessageUser,
      blockDirectMessageUser,
    },
  } = useDirectMessageInteractions({
    dmWorkspaceEnabled,
    friendsSocialPanelEnabled,
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
  useEffect(() => {
    elevatedServerAccessByIdRef.current.clear();
    setIsCurrentUserElevatedInCurrentServer(false);
    setIsCurrentUserElevatedInActiveVoiceServer(false);
    setIsCurrentUserElevatedInMembersModalServer(false);
  }, [currentServerId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentServerId || !user?.id) {
      setIsCurrentUserElevatedInCurrentServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureIsElevatedInServer(currentServerId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInCurrentServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(
          "Failed to resolve elevated current server status:",
          error,
        );
        setIsCurrentUserElevatedInCurrentServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentServerId, ensureIsElevatedInServer, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const activeVoiceCommunityId = activeVoiceChannel?.community_id ?? null;
    if (!activeVoiceCommunityId || !user?.id) {
      setIsCurrentUserElevatedInActiveVoiceServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureIsElevatedInServer(activeVoiceCommunityId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInActiveVoiceServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to resolve elevated voice server status:", error);
        setIsCurrentUserElevatedInActiveVoiceServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeVoiceChannel?.community_id, ensureIsElevatedInServer, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!membersModalCommunityId || !user?.id) {
      setIsCurrentUserElevatedInMembersModalServer(false);
      return () => {
        cancelled = true;
      };
    }

    void ensureIsElevatedInServer(membersModalCommunityId)
      .then((isElevated) => {
        if (!cancelled) {
          setIsCurrentUserElevatedInMembersModalServer(isElevated);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(
          "Failed to resolve elevated members modal status:",
          error,
        );
        setIsCurrentUserElevatedInMembersModalServer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ensureIsElevatedInServer, membersModalCommunityId, user?.id]);

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

  // ── Business functions ────────────────────────────────────────────────────
  const joinServerByInvite = useCallback(
    async (
      inviteInput: string,
    ): Promise<{ communityName: string; joined: boolean }> => {
      const code = normalizeInviteCode(inviteInput);
      if (!code) throw new Error("Invite code is required.");
      const redeemedInvite =
        await controlPlaneBackend.redeemCommunityInvite(code);
      await refreshServers();
      setCurrentServerId(redeemedInvite.communityId);
      return {
        communityName: redeemedInvite.communityName,
        joined: redeemedInvite.joined,
      };
    },
    [controlPlaneBackend, refreshServers, setCurrentServerId],
  );

  const saveAttachment = useCallback(async (attachment: MessageAttachment) => {
    if (!attachment.signedUrl) throw new Error("Media link is not available.");
    if (!desktopClient.isAvailable()) {
      window.open(attachment.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const suggestedName =
      attachment.originalFilename ??
      attachment.objectPath.split("/").pop() ??
      "media";
    await desktopClient.saveFileFromUrl({
      url: attachment.signedUrl,
      suggestedName,
    });
  }, []);

  const reportUserProfile = useCallback(
    async (input: {
      targetUserId: string;
      reason: string;
      communityId?: string;
    }) => {
      if (!user) throw new Error("Not authenticated.");
      const targetCommunityId = input.communityId ?? currentServerId;
      if (!targetCommunityId) throw new Error("No server selected.");
      const communityBackend = getCommunityDataBackend(targetCommunityId);
      await communityBackend.reportUserProfile({
        communityId: targetCommunityId,
        targetUserId: input.targetUserId,
        reporterUserId: user.id,
        reason: input.reason,
      });
    },
    [user, currentServerId],
  );

  const banUserFromServer = useCallback(
    async (input: {
      targetUserId: string;
      communityId: string;
      reason: string;
    }) => {
      const communityBackend = getCommunityDataBackend(input.communityId);
      const banResult = await communityBackend.banCommunityMember({
        communityId: input.communityId,
        targetUserId: input.targetUserId,
        reason: input.reason,
      });
      try {
        await communityBackend.broadcastMemberBanned(banResult);
      } catch (error) {
        console.error("Failed to broadcast member ban:", error);
      }
      try {
        await refreshMembersModalMembersIfOpen(input.communityId);
      } catch (error) {
        console.error("Failed to refresh members after ban:", error);
      }
      if (showServerSettingsModal && currentServerId === input.communityId) {
        try {
          await loadCommunityBans(input.communityId);
        } catch (error) {
          console.error("Failed to refresh bans after ban:", error);
        }
      }
    },
    [
      refreshMembersModalMembersIfOpen,
      loadCommunityBans,
      showServerSettingsModal,
      currentServerId,
    ],
  );

  const kickUserFromServer = useCallback(
    async (input: {
      targetUserId: string;
      communityId: string;
      username: string;
    }) => {
      try {
        const communityBackend = getCommunityDataBackend(input.communityId);
        await communityBackend.kickCommunityMember({
          communityId: input.communityId,
          targetUserId: input.targetUserId,
        });
        try {
          await refreshMembersModalMembersIfOpen(input.communityId);
        } catch (error) {
          console.error("Failed to refresh members after kick:", error);
        }
        toast(`${input.username} has been removed from the server.`, {
          id: `server-kick:${input.communityId}:${input.targetUserId}`,
          action: {
            label: "Dismiss",
            onClick: () => {
              toast.dismiss(
                `server-kick:${input.communityId}:${input.targetUserId}`,
              );
            },
          },
        });
      } catch (error: unknown) {
        toast.error(
          getErrorMessage(error, "Failed to remove user from the server."),
          {
            id: `server-kick-error:${input.communityId}:${input.targetUserId}`,
          },
        );
        throw error;
      }
    },
    [refreshMembersModalMembersIfOpen],
  );

  const saveMemberChannelPermissions = useCallback(
    async (
      memberId: string,
      permissions: {
        canView: boolean | null;
        canSend: boolean | null;
        canManage: boolean | null;
      },
    ) => {
      const accessRevokedResult = await saveMemberChannelPermissionsRaw(
        memberId,
        permissions,
      );
      if (!accessRevokedResult) return;
      applyChannelAccessRevokedContentVisibility(accessRevokedResult);
    },
    [
      applyChannelAccessRevokedContentVisibility,
      saveMemberChannelPermissionsRaw,
    ],
  );

  const resolveBanEligibleServers = useCallback(
    async (targetUserId: string): Promise<BanEligibleServer[]> => {
      if (!targetUserId) return [];
      return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
    },
    [controlPlaneBackend],
  );

  const saveAccountSettings = useCallback(
    async (values: {
      username: string;
      avatarUrl: string | null;
      avatarFile?: File | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const updatedProfile = await controlPlaneBackend.updateUserProfile({
        userId: user.id,
        username: values.username,
        avatarUrl: values.avatarUrl,
        avatarFile: values.avatarFile ?? null,
      });
      applyLocalProfileUpdate(updatedProfile);
      upsertLiveProfile({
        userId: user.id,
        username: updatedProfile.username,
        avatarUrl: updatedProfile.avatarUrl,
        updatedAt: new Date().toISOString(),
      });
    },
    [user, controlPlaneBackend, applyLocalProfileUpdate, upsertLiveProfile],
  );

  // ── Deep links ────────────────────────────────────────────────────────────
  useDeepLinks({
    user,
    featureFlagsLoaded,
    friendsSocialPanelEnabled,
    joinServerByInvite,
    openDirectMessageConversation,
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
      useUiStore.getState().setPendingUiConfirmation({
        kind: "leave-server",
        communityId,
        serverName: server?.name ?? "this server",
      });
    },
    [servers],
  );

  const handleDeleteServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-server",
        communityId,
        serverName: server?.name ?? "this server",
      });
    },
    [servers],
  );

  const handleRenameServer = useCallback(
    (communityId: string) => {
      const server = servers.find((s) => s.id === communityId);
      if (!server) return;
      useUiStore.getState().setRenameServerDraft({
        serverId: communityId,
        currentName: server.name,
      });
    },
    [servers],
  );

  const handleRenameChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      useUiStore.getState().setRenameChannelDraft({
        channelId,
        currentName: channel.name,
      });
    },
    [channels],
  );

  const handleDeleteChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      if (!channel) return;
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-channel",
        channelId,
        channelName: channel.name,
      });
    },
    [channels],
  );

  const handleCreateChannelGroup = useCallback((channelId?: string) => {
    useUiStore.getState().setCreateGroupDraft({
      channelId: channelId ?? null,
    });
  }, []);

  const handleRenameChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupState.groups.find((g) => g.id === groupId);
      if (!group) return;
      useUiStore.getState().setRenameGroupDraft({
        groupId,
        currentName: group.name,
      });
    },
    [channelGroupState.groups],
  );

  const handleDeleteChannelGroup = useCallback(
    (groupId: string) => {
      const group = channelGroupState.groups.find((g) => g.id === groupId);
      if (!group) return;
      useUiStore.getState().setPendingUiConfirmation({
        kind: "delete-channel-group",
        groupId,
        groupName: group.name,
      });
    },
    [channelGroupState.groups],
  );

  const confirmPendingUiAction = useCallback(() => {
    const ui = useUiStore.getState();
    const action = ui.pendingUiConfirmation;
    if (!action) return;
    ui.setPendingUiConfirmation(null);
    switch (action.kind) {
      case "leave-server":
        void leaveServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to leave server."), {
            id: "leave-server-error",
          });
        });
        return;
      case "delete-server":
        void deleteServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to delete server."), {
            id: "delete-server-error",
          });
        });
        return;
      case "delete-channel":
        void deleteChannel(action.channelId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, "Failed to delete channel."), {
            id: "delete-channel-error",
          });
        });
        return;
      case "delete-channel-group":
        void deleteChannelGroup(action.groupId).catch((error: unknown) => {
          toast.error(
            getErrorMessage(error, "Failed to delete channel group."),
            {
              id: "delete-channel-group-error",
            },
          );
        });
        return;
      default:
        return;
    }
  }, [leaveServer, deleteServer, deleteChannel, deleteChannelGroup]);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (friendsSocialPanelEnabled) return;
    resetSocialWorkspace();
    setWorkspaceMode("community");
    resetDirectMessages();
  }, [friendsSocialPanelEnabled, resetDirectMessages, resetSocialWorkspace]);

  useEffect(() => {
    if (serverModmailEnabled) return;
    useUiStore.getState().setServerModmailOpen(false);
  }, [serverModmailEnabled]);

  // Sign-out reset — clear all state when user logs out.
  useEffect(() => {
    if (user) return;
    useNavigationStore.getState().clearNavigation();
    resetPlatformSession();
    resetVoiceState();
    setNotificationsPanelOpen(false);
    useUiStore.getState().reset();
    setFriendsPanelOpen(false);
    setWorkspaceMode("community");
    resetMessageState();
    authorProfileCacheRef.current = {};
    resetFeatureFlags();
    resetNotifications();
    resetSocialWorkspace();
    resetDirectMessages();
    resetChannelsWorkspace();
    usePermissionsStore.getState().reset();
    resetServerSettingsState();
    resetServerInvites();
    resetServerRoleManagement();
    resetChannelPermissionsState();
    resetChannelGroups();
    resetMembersModal();
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
    resetMessageState();
    useUiStore.getState().setShowCreateChannelModal(false);
    useUiStore.getState().setShowJoinServerModal(false);
    useUiStore.getState().setShowServerSettingsModal(false);
    useUiStore.getState().setShowChannelSettingsModal(false);
    useUiStore.getState().setChannelSettingsTargetId(null);
    resetServerSettingsState();
    resetServerInvites();
    resetServerRoleManagement();
    resetChannelPermissionsState();
    resetChannelGroups();
    resetMembersModal();
    useUiStore.getState().setRenameChannelDraft(null);
    useUiStore.getState().setRenameGroupDraft(null);
    useUiStore.getState().setCreateGroupDraft(null);
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
    resetServerSettingsState,
    resetMessageState,
    resetVoiceState,
  ]);

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
          }),
      );
    })();
  }, [
    servers,
    user?.id,
    currentServerId,
    prefetchServersChannels,
    getDefaultChannelIdForServer,
    prefetchChannelMessages,
  ]);

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
    friendsSocialPanelEnabled,
    dmWorkspaceEnabled,
    dmWorkspaceIsActive,
    serverModmailEnabled,
    voiceHardwareDebugPanelEnabled,
    // community
    channels,
    channelsLoading,
    channelsError,
    serverReportPermissionsById,
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
