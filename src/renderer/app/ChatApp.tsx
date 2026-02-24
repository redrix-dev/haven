import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginScreen } from '@/components/LoginScreen';
import { ServerList } from '@/components/ServerList';
import { CreateServerModal } from '@/components/CreateServerModal';
import { CreateChannelModal } from '@/components/CreateChannelModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
import { QuickRenameDialog } from '@/components/QuickRenameDialog';
import { ServerMembersModal } from '@/components/ServerMembersModal';
import {
  ServerSettingsModal,
} from '@/components/ServerSettingsModal';
import {
  ChannelSettingsModal,
} from '@/components/ChannelSettingsModal';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { VoiceChannelPane } from '@/components/VoiceChannelPane';
import { VoiceHardwareDebugPanel } from '@/components/VoiceHardwareDebugPanel';
import { NotificationCenterModal } from '@/components/NotificationCenterModal';
import { FriendsModal } from '@/components/FriendsModal';
import { DirectMessagesSidebar } from '@/components/DirectMessagesSidebar';
import { DirectMessageArea } from '@/components/DirectMessageArea';
import { DmReportReviewPanel } from '@/components/DmReportReviewPanel';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useServers } from '@/lib/hooks/useServers';
import {
  getCommunityDataBackend,
  getControlPlaneBackend,
  getDirectMessageBackend,
  getNotificationBackend,
  getSocialBackend,
} from '@/lib/backend';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import { installPromptTrap } from '@/lib/contextMenu/debugTrace';
import {
  DEFAULT_APP_SETTINGS,
  DM_REPORT_REVIEW_PANEL_FLAG,
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  FRIENDS_SOCIAL_PANEL_FLAG,
  MESSAGE_PAGE_SIZE,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
  VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL,
} from '@/renderer/app/constants';
import type {
  PendingUiConfirmation,
} from '@/renderer/app/types';
import { getPendingUiConfirmationCopy } from '@/renderer/app/ui-confirmations';
import { useDesktopSettings } from '@/renderer/features/desktop/hooks/useDesktopSettings';
import { useCommunityWorkspace } from '@/renderer/features/community/hooks/useCommunityWorkspace';
import { useServerAdmin } from '@/renderer/features/community/hooks/useServerAdmin';
import { useChannelManagement } from '@/renderer/features/community/hooks/useChannelManagement';
import { useChannelGroups } from '@/renderer/features/community/hooks/useChannelGroups';
import { useMessages } from '@/renderer/features/messages/hooks/useMessages';
import { useNotifications } from '@/renderer/features/notifications/hooks/useNotifications';
import { useNotificationInteractions } from '@/renderer/features/notifications/hooks/useNotificationInteractions';
import { useSocialWorkspace } from '@/renderer/features/social/hooks/useSocialWorkspace';
import { useDirectMessages } from '@/renderer/features/direct-messages/hooks/useDirectMessages';
import { useDirectMessageInteractions } from '@/renderer/features/direct-messages/hooks/useDirectMessageInteractions';
import { useVoice } from '@/renderer/features/voice/hooks/useVoice';
import { useFeatureFlags } from '@/renderer/features/session/hooks/useFeatureFlags';
import { usePlatformSession } from '@/renderer/features/session/hooks/usePlatformSession';
import type {
  AuthorProfile,
  BanEligibleServer,
  Channel,
  ChannelKind,
  MessageAttachment,
  MessageLinkPreview,
  MessageReaction,
  Message,
} from '@/lib/backend/types';
import { Headphones, Mic, MicOff, PhoneOff, Settings2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

export function ChatApp() {
  const controlPlaneBackend = getControlPlaneBackend();
  const directMessageBackend = getDirectMessageBackend();
  const notificationBackend = getNotificationBackend();
  const socialBackend = getSocialBackend();
  const { user, status: authStatus, error: authError, signOut, deleteAccount } = useAuth();
  const {
    servers,
    status: serversStatus,
    error: serversError,
    createServer,
    refreshServers,
  } = useServers();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showChannelSettingsModal, setShowChannelSettingsModal] = useState(false);
  const [channelSettingsTargetId, setChannelSettingsTargetId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachment[]>([]);
  const [messageLinkPreviews, setMessageLinkPreviews] = useState<MessageLinkPreview[]>([]);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});
  const {
    state: { featureFlags },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({
    controlPlaneBackend,
    userId: user?.id,
  });
  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS || hasFeatureFlag('debug_channel_reload_diagnostics');
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(VOICE_HARDWARE_DEBUG_PANEL_FLAG);
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
  const [canSendHavenDeveloperMessage, setCanSendHavenDeveloperMessage] = useState(false);
  const [dmReportReviewPanelOpen, setDmReportReviewPanelOpen] = useState(false);
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
    },
  } = useCommunityWorkspace({
    servers,
    currentUserId: user?.id ?? null,
    channelSettingsTargetId,
  });
  const {
    state: {
      activeVoiceChannelId,
      voicePanelOpen,
      voiceHardwareDebugPanelOpen,
      voiceConnected,
      voiceParticipants,
      voiceSessionState,
      canSpeakInVoiceChannel,
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
    },
  } = useVoice({
    currentServerId,
    currentUserId: user?.id,
    currentUserDisplayName:
      (isPlatformStaff
        ? `${platformStaffPrefix ?? 'Haven'}-${profileUsername || user?.email?.split('@')[0] || 'User'}`
        : profileUsername || user?.email?.split('@')[0] || 'User'),
    currentChannelId,
    setCurrentChannelId,
    voiceHardwareDebugPanelEnabled,
    channels,
  });
  const [renameServerDraft, setRenameServerDraft] = useState<{ serverId: string; currentName: string } | null>(
    null
  );
  const [renameChannelDraft, setRenameChannelDraft] = useState<{ channelId: string; currentName: string } | null>(
    null
  );
  const [renameGroupDraft, setRenameGroupDraft] = useState<{ groupId: string; currentName: string } | null>(null);
  const [createGroupDraft, setCreateGroupDraft] = useState<{ channelId: string | null } | null>(null);
  const [pendingUiConfirmation, setPendingUiConfirmation] = useState<PendingUiConfirmation | null>(
    null
  );
  const {
    state: { channelGroupState },
    actions: {
      resetChannelGroups,
      refreshChannelGroupsState,
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
    channels,
  });
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
      loadServerInvites,
      createServerInvite,
      revokeServerInvite,
      resetServerRoleManagement,
      loadServerRoleManagement,
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
      saveMemberChannelPermissions,
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
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'community' | 'dm'>('community');
  const {
    state: {
      appSettings,
      appSettingsLoading,
      updaterStatus,
      updaterStatusLoading,
      checkingForUpdates,
      notificationAudioSettingsSaving,
      notificationAudioSettingsError,
    },
    actions: {
      setAutoUpdateEnabled,
      setNotificationAudioSettings,
      checkForUpdatesNow,
    },
  } = useDesktopSettings();
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;
  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === 'dm';
  const dmReportReviewPanelEnabled = isPlatformStaff && hasFeatureFlag(DM_REPORT_REVIEW_PANEL_FLAG);
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
      setNotificationsError,
    },
  } = useNotifications({
    notificationBackend,
    userId: user?.id,
    notificationsPanelOpen,
    audioSettings: appSettings.notifications,
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
    selectedDmConversationId,
    dmConversations,
    setSelectedDmConversationId,
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
  const {
    actions: {
      openNotificationItem,
      acceptFriendRequestFromNotification,
      declineFriendRequestFromNotification,
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
      setFriendsPanelRequestedTab(tab);
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

  useEffect(() => {
    if (user) return;

    resetPlatformSession();
    resetVoiceState();
    setDmReportReviewPanelOpen(false);
    setNotificationsPanelOpen(false);
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
    resetFeatureFlags,
    resetCommunityBans,
    resetMessageState,
    resetMembersModal,
    resetNotifications,
    resetPlatformSession,
    resetDirectMessages,
    resetSocialWorkspace,
    resetVoiceState,
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
    resetServerPermissions,
    user,
  ]);

  // Reset server-scoped UI when no server is selected
  useEffect(() => {
    if (!currentServerId) {
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
    }
  }, [
    currentServerId,
    resetChannelGroups,
    resetChannelPermissionsState,
    resetChannelsWorkspace,
    resetCommunityBans,
    resetMembersModal,
    resetVoiceState,
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
  ]);

  // Determine whether Haven Developer messaging is allowed in the current channel.
  useEffect(() => {
    let isMounted = true;

    if (!user || !currentServerId || !currentChannelId || !canPostHavenDevMessage) {
      setCanSendHavenDeveloperMessage(false);
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      setCanSendHavenDeveloperMessage(false);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const resolveHavenDeveloperMessagingAccess = async () => {
      try {
        const allowed = await communityBackend.isHavenDeveloperMessagingAllowed({
          communityId: currentServerId,
          channelId: currentChannelId,
        });
        if (!isMounted) return;
        setCanSendHavenDeveloperMessage(allowed);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error resolving Haven developer messaging access:', error);
        setCanSendHavenDeveloperMessage(false);
      }
    };

    void resolveHavenDeveloperMessagingAccess();

    return () => {
      isMounted = false;
    };
  }, [user, currentServerId, currentChannelId, canPostHavenDevMessage, channels]);

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

  async function joinServerByInvite(inviteInput: string): Promise<{
    communityName: string;
    joined: boolean;
  }> {
    const code = normalizeInviteCode(inviteInput);
    if (!code) {
      throw new Error('Invite code is required.');
    }

    const redeemedInvite = await controlPlaneBackend.redeemCommunityInvite(code);

    await refreshServers();
    setCurrentServerId(redeemedInvite.communityId);

    return {
      communityName: redeemedInvite.communityName,
      joined: redeemedInvite.joined,
    };
  }

  async function saveAttachment(attachment: MessageAttachment) {
    if (!attachment.signedUrl) {
      throw new Error('Media link is not available.');
    }

    if (!desktopClient.isAvailable()) {
      window.open(attachment.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const suggestedName = attachment.originalFilename ?? attachment.objectPath.split('/').pop() ?? 'media';
    await desktopClient.saveFileFromUrl({
      url: attachment.signedUrl,
      suggestedName,
    });
  }

  async function reportUserProfile(input: {
    targetUserId: string;
    reason: string;
    communityId?: string;
  }) {
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
  }

  async function banUserFromServer(input: {
    targetUserId: string;
    communityId: string;
    reason: string;
  }) {
    const communityBackend = getCommunityDataBackend(input.communityId);
    await communityBackend.banCommunityMember({
      communityId: input.communityId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    });

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
  }

  async function resolveBanEligibleServers(targetUserId: string): Promise<BanEligibleServer[]> {
    if (!targetUserId) return [];
    return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
  }

  async function sendHavenDeveloperMessage(
    content: string,
    options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
  ) {
    if (!currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.postHavenDeveloperMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      content,
      replyToMessageId: options?.replyToMessageId,
      mediaUpload: options?.mediaFile
        ? {
            file: options.mediaFile,
            expiresInHours: options.mediaExpiresInHours,
          }
        : undefined,
    });
  }

  async function saveAccountSettings(values: { username: string; avatarUrl: string | null }) {
    if (!user) throw new Error('Not authenticated');

    await controlPlaneBackend.updateUserProfile({
      userId: user.id,
      username: values.username,
      avatarUrl: values.avatarUrl,
    });

    applyLocalProfileUpdate(values);
  }

  const handleLeaveServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    setPendingUiConfirmation({
      kind: 'leave-server',
      communityId,
      serverName: server?.name ?? 'this server',
    });
  };

  const handleDeleteServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    setPendingUiConfirmation({
      kind: 'delete-server',
      communityId,
      serverName: server?.name ?? 'this server',
    });
  };

  const handleRenameServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    if (!server) return;
    setRenameServerDraft({
      serverId: communityId,
      currentName: server.name,
    });
  };

  const handleRenameChannel = (channelId: string) => {
    const channel = channels.find((candidate) => candidate.id === channelId);
    if (!channel) return;
    setRenameChannelDraft({
      channelId,
      currentName: channel.name,
    });
  };

  const handleDeleteChannel = (channelId: string) => {
    const channel = channels.find((candidate) => candidate.id === channelId);
    if (!channel) return;
    setPendingUiConfirmation({
      kind: 'delete-channel',
      channelId,
      channelName: channel.name,
    });
  };

  const handleCreateChannelGroup = (channelId?: string) => {
    setCreateGroupDraft({
      channelId: channelId ?? null,
    });
  };

  const handleRenameChannelGroup = (groupId: string) => {
    const group = channelGroupState.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    setRenameGroupDraft({
      groupId,
      currentName: group.name,
    });
  };

  const handleDeleteChannelGroup = (groupId: string) => {
    const group = channelGroupState.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    setPendingUiConfirmation({
      kind: 'delete-channel-group',
      groupId,
      groupName: group.name,
    });
  };

  const confirmPendingUiAction = () => {
    if (!pendingUiConfirmation) return;

    const action = pendingUiConfirmation;
    setPendingUiConfirmation(null);

    switch (action.kind) {
      case 'leave-server':
        void leaveServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to leave server.'), { id: 'leave-server-error' });
        });
        return;
      case 'delete-server':
        void deleteServer(action.communityId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete server.'), { id: 'delete-server-error' });
        });
        return;
      case 'delete-channel':
        void deleteChannel(action.channelId).catch((error: unknown) => {
          toast.error(getErrorMessage(error, 'Failed to delete channel.'), { id: 'delete-channel-error' });
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
  };

  if (authStatus === 'initializing') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        Loading...
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#111a2b] text-white">
        <p>{authError ?? 'Authentication failed. Please restart the app.'}</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const isServersLoading = serversStatus === 'loading';
  const baseUserDisplayName = profileUsername || user.email?.split('@')[0] || 'User';
  const userDisplayName = isPlatformStaff
    ? `${platformStaffPrefix ?? 'Haven'}-${baseUserDisplayName}`
    : baseUserDisplayName;
  const canOpenServerSettings =
    serverPermissions.canManageServer ||
    serverPermissions.canManageRoles ||
    serverPermissions.canManageMembers ||
    serverPermissions.canManageBans ||
    serverPermissions.canManageInvites ||
    serverPermissions.canManageDeveloperAccess;
  const canManageCurrentServer = serverPermissions.isOwner || serverPermissions.canManageServer;
  const sidebarChannelGroups = channelGroupState.groups.map((group) => ({
    id: group.id,
    name: group.name,
    channelIds: group.channelIds,
    isCollapsed: channelGroupState.collapsedGroupIds.includes(group.id),
  }));
  const showDmWorkspace = dmWorkspaceIsActive;
  const selectedDmConversation =
    selectedDmConversationId
      ? dmConversations.find((conversation) => conversation.conversationId === selectedDmConversationId) ??
        null
      : null;
  const {
    title: pendingUiConfirmationTitle,
    description: pendingUiConfirmationDescription,
    confirmLabel: pendingUiConfirmationConfirmLabel,
    isDestructive: pendingUiConfirmationIsDestructive,
  } = getPendingUiConfirmationCopy(pendingUiConfirmation);

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          servers={servers}
          currentServerId={currentServerId}
          currentServerIsOwner={serverPermissions.isOwner}
          canManageCurrentServer={canManageCurrentServer}
          canOpenCurrentServerSettings={canOpenServerSettings}
          onServerClick={(serverId) => {
            setWorkspaceMode('community');
            setCurrentServerId(serverId);
          }}
          onCreateServer={() => setShowCreateModal(true)}
          onJoinServer={() => setShowJoinServerModal(true)}
          onOpenNotifications={() => setNotificationsPanelOpen(true)}
          notificationUnseenCount={notificationCounts.unseenCount}
          notificationHasUnseenPulse={notificationCounts.unseenCount > 0}
          onOpenDirectMessages={dmWorkspaceEnabled ? openDirectMessagesWorkspace : undefined}
          directMessagesActive={dmWorkspaceIsActive}
          onOpenFriends={
            friendsSocialPanelEnabled
              ? () => {
                  setFriendsPanelRequestedTab(null);
                  setFriendsPanelHighlightedRequestId(null);
                  setFriendsPanelOpen(true);
                }
              : undefined
          }
          friendRequestIncomingCount={socialCounts.incomingPendingRequestCount}
          friendRequestHasPendingPulse={socialCounts.incomingPendingRequestCount > 0}
          onOpenDmReportReview={
            dmReportReviewPanelEnabled ? () => setDmReportReviewPanelOpen(true) : undefined
          }
          userDisplayName={userDisplayName}
          userAvatarUrl={profileAvatarUrl}
          onOpenAccountSettings={() => setShowAccountModal(true)}
          onViewServerMembers={(serverId) => {
            void openServerMembersModal(serverId);
          }}
          onLeaveServer={handleLeaveServer}
          onDeleteServer={handleDeleteServer}
          onRenameServer={handleRenameServer}
          onOpenServerSettingsForServer={(serverId) => {
            void openServerSettingsModal(serverId);
          }}
        />

        {showDmWorkspace ? (
          <>
            <DirectMessagesSidebar
              currentUserDisplayName={userDisplayName}
              conversations={dmConversations}
              selectedConversationId={selectedDmConversationId}
              loading={dmConversationsLoading}
              refreshing={dmConversationsRefreshing}
              error={dmConversationsError}
              onSelectConversation={(conversationId) => {
                setSelectedDmConversationId(conversationId);
              }}
              onRefresh={() => {
                void refreshDmConversations({ suppressLoadingState: true });
              }}
            />
            <DirectMessageArea
              currentUserId={user.id}
              currentUserDisplayName={userDisplayName}
              conversation={selectedDmConversation}
              messages={dmMessages}
              loading={dmMessagesLoading}
              sending={dmMessageSendPending}
              refreshing={dmMessagesRefreshing}
              error={dmMessagesError}
              onRefresh={() => {
                if (!selectedDmConversationId) return;
                void refreshDmMessages(selectedDmConversationId, {
                  suppressLoadingState: true,
                  markRead: true,
                });
              }}
              onSendMessage={sendDirectMessage}
              onToggleMute={toggleSelectedDmConversationMuted}
              onBlockUser={blockDirectMessageUser}
              onReportMessage={reportDirectMessage}
            />
          </>
        ) : isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">Loading servers...</p>
          </div>
        ) : currentServer ? (
          <>
            <Sidebar
              serverName={currentServer.name}
              userName={userDisplayName}
              composerHeight={composerHeight}
              channels={channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                kind: channel.kind,
              }))}
              channelGroups={sidebarChannelGroups}
              ungroupedChannelIds={channelGroupState.ungroupedChannelIds}
              currentChannelId={currentChannelId}
              onChannelClick={setCurrentChannelId}
              onVoiceChannelClick={requestVoiceChannelJoin}
              activeVoiceChannelId={activeVoiceChannelId}
              voiceChannelParticipants={voiceChannelParticipants}
              voiceStatusPanel={
                activeVoiceChannel ? (
                  <div className="px-2 pt-2 pb-1 border-b border-[#22334f]">
                    <div className="rounded-md border border-[#304867] bg-[#142033] px-2 py-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">Voice Connected</p>
                          <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
                            <Headphones className="size-3.5" />
                            {activeVoiceChannel.name}
                          </p>
                          <p className="text-[11px] text-[#95a5bf] truncate">{currentServer.name}</p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            voiceConnected
                              ? 'bg-[#2f9f73]/20 text-[#6dd5a6]'
                              : 'bg-[#44546f]/40 text-[#b5c4de]'
                          }`}
                        >
                          {voiceConnected ? 'Live' : 'Connecting'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {!voiceSessionState.joined ? (
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => voiceControlActions?.join()}
                            disabled={voiceSessionState.joining || !voiceControlActions}
                            className="text-[#a9b8cf] hover:text-white hover:bg-[#22334f]"
                          >
                            <Headphones className="size-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => voiceControlActions?.toggleMute()}
                              disabled={voiceSessionState.listenOnly || !voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                voiceSessionState.isMuted
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              {voiceSessionState.isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => voiceControlActions?.toggleDeafen()}
                              disabled={!voiceControlActions}
                              className={`hover:bg-[#22334f] ${
                                voiceSessionState.isDeafened
                                  ? 'text-[#f3a2a2] hover:text-[#ffd2d2]'
                                  : 'text-[#a9b8cf] hover:text-white'
                              }`}
                            >
                              <VolumeX className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setVoicePanelOpen((prev) => !prev)}
                          className={`hover:text-white hover:bg-[#22334f] ${
                            voicePanelOpen ? 'text-white' : 'text-[#a9b8cf]'
                          }`}
                        >
                          <Settings2 className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => disconnectVoiceSession()}
                          className="text-[#f0b0b0] hover:text-[#ffd1d1] hover:bg-[#3b2535]"
                        >
                          <PhoneOff className="size-4" />
                        </Button>
                        <div className="ml-auto text-[11px] text-[#95a5bf]">
                          {activeVoiceParticipantCount} in call
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null
              }
              onCreateChannel={
                serverPermissions.canCreateChannels ? () => setShowCreateChannelModal(true) : undefined
              }
              canManageChannels={serverPermissions.canManageChannels}
              onRenameChannel={
                serverPermissions.canManageChannels
                  ? handleRenameChannel
                  : undefined
              }
              onDeleteChannel={
                serverPermissions.canManageChannels
                  ? handleDeleteChannel
                  : undefined
              }
              onOpenChannelSettings={
                serverPermissions.canManageChannels
                  ? (channelId) => {
                      void openChannelSettingsModal(channelId);
                    }
                  : undefined
              }
              onAddChannelToGroup={
                serverPermissions.canManageChannels
                  ? (channelId, groupId) => {
                      void assignChannelToGroup(channelId, groupId).catch((error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to assign channel to group.'), {
                          id: 'assign-channel-group-error',
                        });
                      });
                    }
                  : undefined
              }
              onRemoveChannelFromGroup={
                serverPermissions.canManageChannels
                  ? (channelId) => {
                      void removeChannelFromGroup(channelId).catch((error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to remove channel from group.'), {
                          id: 'remove-channel-group-error',
                        });
                      });
                    }
                  : undefined
              }
              onCreateChannelGroup={
                serverPermissions.canManageChannels ? handleCreateChannelGroup : undefined
              }
              onToggleChannelGroup={
                (groupId, isCollapsed) => {
                  void setChannelGroupCollapsed(groupId, isCollapsed).catch((error: unknown) => {
                    console.error('Failed to persist channel group collapse state:', error);
                  });
                }
              }
              onRenameChannelGroup={
                serverPermissions.canManageChannels ? handleRenameChannelGroup : undefined
              }
              onDeleteChannelGroup={
                serverPermissions.canManageChannels ? handleDeleteChannelGroup : undefined
              }
              onOpenServerSettings={
                canOpenServerSettings ? () => void openServerSettingsModal() : undefined
              }
            />
            {channelsLoading && !currentRenderableChannel ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">Loading channels...</p>
              </div>
            ) : currentRenderableChannel ? (
              <ChatArea
                communityId={currentServer.id}
                channelId={currentRenderableChannel.id}
                channelName={currentRenderableChannel.name}
                channelKind={currentRenderableChannel.kind}
                currentUserDisplayName={userDisplayName}
                messages={messages}
                messageReactions={messageReactions}
                messageAttachments={messageAttachments}
                messageLinkPreviews={messageLinkPreviews}
                authorProfiles={authorProfiles}
                currentUserId={user.id}
                canSpeakInVoiceChannel={canSpeakInVoiceChannel}
                canManageMessages={serverPermissions.canManageMessages}
                canCreateReports={serverPermissions.canCreateReports}
                canManageBans={serverPermissions.canManageBans}
                canRefreshLinkPreviews={serverPermissions.canRefreshLinkPreviews}
                showVoiceDiagnostics={isPlatformStaff}
                onOpenChannelSettings={
                  serverPermissions.canManageChannels
                    ? () => void openChannelSettingsModal(currentRenderableChannel.id)
                    : undefined
                }
                onOpenVoiceControls={() => setVoicePanelOpen(true)}
                onSendMessage={sendMessage}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onToggleMessageReaction={toggleMessageReaction}
                onReportMessage={reportMessage}
                onRequestMessageLinkPreviewRefresh={requestMessageLinkPreviewRefresh}
                hasOlderMessages={hasOlderMessages}
                isLoadingOlderMessages={isLoadingOlderMessages}
                onRequestOlderMessages={requestOlderMessages}
                onSaveAttachment={saveAttachment}
                onReportUserProfile={({ targetUserId, reason }) =>
                  reportUserProfile({
                    targetUserId,
                    reason,
                    communityId: currentServer.id,
                  })
                }
                onBanUserFromServer={banUserFromServer}
                onResolveBanEligibleServers={resolveBanEligibleServers}
                onDirectMessageUser={directMessageUser}
                onComposerHeightChange={setComposerHeight}
                onSendHavenDeveloperMessage={
                  canSendHavenDeveloperMessage ? sendHavenDeveloperMessage : undefined
                }
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">
                  {channelsError ?? 'No channels yet. Create one to get started!'}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">
              {serversError ?? 'No servers yet. Create one to get started!'}
            </p>
          </div>
        )}
      </div>

      {currentServer && activeVoiceChannel && (
        <div
          className={`fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${
            voicePanelOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!voicePanelOpen}
        >
          <div
            className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
              voicePanelOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => setVoicePanelOpen(false)}
          />
          <div
            className={`relative z-10 w-full max-w-4xl max-h-[88vh] rounded-lg border border-[#304867] bg-[#111a2b] shadow-2xl overflow-hidden transition-all duration-200 ${
              voicePanelOpen ? 'translate-y-0 scale-100' : 'translate-y-3 scale-[0.98]'
            }`}
          >
            <div className="scrollbar-inset max-h-[88vh] overflow-y-auto">
              <VoiceChannelPane
                communityId={currentServer.id}
                channelId={activeVoiceChannel.id}
                channelName={activeVoiceChannel.name}
                currentUserId={user.id}
                currentUserDisplayName={userDisplayName}
                canSpeak={canSpeakInVoiceChannel}
                showDiagnostics={isPlatformStaff}
                autoJoin
                onParticipantsChange={setVoiceParticipants}
                onConnectionChange={setVoiceConnected}
                onSessionStateChange={setVoiceSessionState}
                onControlActionsReady={setVoiceControlActions}
                onLeave={() => disconnectVoiceSession({ triggerPaneLeave: false })}
              />
            </div>
          </div>
        </div>
      )}

      <NotificationCenterModal
        open={notificationsPanelOpen}
        onOpenChange={setNotificationsPanelOpen}
        notifications={notificationItems}
        counts={notificationCounts}
        loading={notificationsLoading}
        error={notificationsError}
        refreshing={notificationsRefreshing}
        onRefresh={() => {
          void refreshNotificationsManually();
        }}
        onMarkAllSeen={() => {
          void markAllNotificationsSeen();
        }}
        onMarkNotificationRead={(recipientId) => {
          void markNotificationRead(recipientId);
        }}
        onDismissNotification={(recipientId) => {
          void dismissNotification(recipientId);
        }}
        onOpenNotificationItem={(notification) => {
          void openNotificationItem(notification);
        }}
        onAcceptFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void acceptFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        onDeclineFriendRequestNotification={({ recipientId, friendRequestId }) => {
          void declineFriendRequestFromNotification({ recipientId, friendRequestId });
        }}
        preferences={notificationPreferences}
        preferencesLoading={notificationPreferencesLoading}
        preferencesSaving={notificationPreferencesSaving}
        preferencesError={notificationPreferencesError}
        onUpdatePreferences={(next) => {
          void saveNotificationPreferences(next);
        }}
        localAudioSettings={appSettings.notifications}
        localAudioSaving={notificationAudioSettingsSaving}
        localAudioError={notificationAudioSettingsError}
        onUpdateLocalAudioSettings={(next) => {
          void setNotificationAudioSettings(next);
        }}
      />

      {friendsSocialPanelEnabled && user && (
        <FriendsModal
          open={friendsPanelOpen}
          onOpenChange={(open) => {
            setFriendsPanelOpen(open);
            if (!open) {
              setFriendsPanelHighlightedRequestId(null);
            }
          }}
          currentUserId={user.id}
          currentUserDisplayName={userDisplayName}
          onStartDirectMessage={directMessageUser}
          requestedTab={friendsPanelRequestedTab}
          highlightedRequestId={friendsPanelHighlightedRequestId}
        />
      )}

      {voiceHardwareDebugPanelEnabled && (
        <VoiceHardwareDebugPanel
          open={voiceHardwareDebugPanelOpen}
          onOpenChange={setVoiceHardwareDebugPanelOpen}
          hotkeyLabel={VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL}
        />
      )}

      {dmReportReviewPanelEnabled && user && (
        <DmReportReviewPanel
          open={dmReportReviewPanelOpen}
          onOpenChange={setDmReportReviewPanelOpen}
          currentUserId={user.id}
          currentUserDisplayName={userDisplayName}
        />
      )}

      <AlertDialog open={Boolean(voiceJoinPrompt)} onOpenChange={(open) => !open && cancelVoiceChannelJoinPrompt()}>
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {voiceJoinPrompt?.mode === 'switch' ? 'Switch voice channel?' : 'Join voice channel?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {voiceJoinPrompt?.mode === 'switch'
                ? 'You are already connected to voice. Switching will move your session to the new channel.'
                : 'Join this voice channel now? You can keep browsing text channels while connected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoiceChannelJoin}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              {voiceJoinPrompt?.mode === 'switch' ? 'Switch' : 'Join'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingUiConfirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingUiConfirmation(null);
          }
        }}
      >
        <AlertDialogContent className="bg-[#18243a] border-[#304867] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingUiConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-[#a9b8cf]">
              {pendingUiConfirmationDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1d2a42] border-[#304867] text-white hover:bg-[#22324d]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmPendingUiAction();
              }}
              className={
                pendingUiConfirmationIsDestructive
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-[#3f79d8] hover:bg-[#325fae] text-white'
              }
            >
              {pendingUiConfirmationConfirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createServer}
        />
      )}

      {showCreateChannelModal && currentServerId && serverPermissions.canCreateChannels && (
        <CreateChannelModal
          onClose={() => setShowCreateChannelModal(false)}
          onCreate={createChannel}
        />
      )}

      {showJoinServerModal && (
        <JoinServerModal
          onClose={() => setShowJoinServerModal(false)}
          onJoin={joinServerByInvite}
        />
      )}

      {showServerSettingsModal && currentServerId && canOpenServerSettings && (
        <ServerSettingsModal
          channels={channels.map((channel) => ({ id: channel.id, name: channel.name }))}
          initialValues={serverSettingsInitialValues}
          loadingInitialValues={serverSettingsLoading}
          initialLoadError={serverSettingsLoadError}
          canManageServer={serverPermissions.canManageServer}
          canManageRoles={serverPermissions.canManageRoles}
          canManageMembers={serverPermissions.canManageMembers}
          canManageBans={serverPermissions.canManageBans}
          isOwner={serverPermissions.isOwner}
          roles={serverRoles}
          members={serverMembers}
          permissionsCatalog={serverPermissionCatalog}
          roleManagementLoading={serverRoleManagementLoading}
          roleManagementError={serverRoleManagementError}
          canManageDeveloperAccess={serverPermissions.canManageDeveloperAccess}
          canManageInvites={serverPermissions.canManageInvites}
          invites={serverInvites}
          invitesLoading={serverInvitesLoading}
          invitesError={serverInvitesError}
          bans={communityBans}
          bansLoading={communityBansLoading}
          bansError={communityBansError}
          inviteBaseUrl="haven://invite/"
          onClose={() => setShowServerSettingsModal(false)}
          onSave={saveServerSettings}
          onCreateRole={createServerRole}
          onUpdateRole={updateServerRole}
          onDeleteRole={deleteServerRole}
          onSaveRolePermissions={saveServerRolePermissions}
          onSaveMemberRoles={saveServerMemberRoles}
          onCreateInvite={createServerInvite}
          onRevokeInvite={revokeServerInvite}
          onUnbanUser={unbanUserFromCurrentServer}
        />
      )}

      {showChannelSettingsModal && channelSettingsTarget && serverPermissions.canManageChannels && (
        <ChannelSettingsModal
          initialName={channelSettingsTarget.name}
          initialTopic={channelSettingsTarget.topic}
          canDelete={channels.length > 1}
          rolePermissions={channelRolePermissions}
          memberPermissions={channelMemberPermissions}
          availableMembers={channelPermissionMemberOptions}
          permissionsLoading={channelPermissionsLoading}
          permissionsLoadError={channelPermissionsLoadError}
          onClose={() => {
            setShowChannelSettingsModal(false);
            setChannelSettingsTargetId(null);
          }}
          onSave={saveChannelSettings}
          onDelete={deleteCurrentChannel}
          onSaveRolePermissions={saveRoleChannelPermissions}
          onSaveMemberPermissions={saveMemberChannelPermissions}
        />
      )}

      <ServerMembersModal
        open={showMembersModal}
        currentUserId={user?.id ?? null}
        serverName={membersModalServerName}
        loading={membersModalLoading}
        error={membersModalError}
        members={membersModalMembers}
        canReportProfiles={membersModalCanCreateReports}
        canBanProfiles={membersModalCanManageBans}
        onResolveBanServers={resolveBanEligibleServers}
        onDirectMessage={directMessageUser}
        onReportUser={async (targetUserId, reason) => {
          if (!membersModalCommunityId) return;
          await reportUserProfile({
            targetUserId,
            reason,
            communityId: membersModalCommunityId,
          });
        }}
        onBanUser={async (targetUserId, communityId, reason) => {
          await banUserFromServer({
            targetUserId,
            communityId,
            reason,
          });
        }}
        onClose={closeMembersModal}
      />

      <QuickRenameDialog
        open={Boolean(renameServerDraft)}
        title="Rename Server"
        initialValue={renameServerDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameServerDraft(null)}
        onConfirm={async (value) => {
          if (!renameServerDraft) return;
          await renameServer(renameServerDraft.serverId, value);
          setRenameServerDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(renameChannelDraft)}
        title="Rename Channel"
        initialValue={renameChannelDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameChannelDraft(null)}
        onConfirm={async (value) => {
          if (!renameChannelDraft) return;
          await renameChannel(renameChannelDraft.channelId, value);
          setRenameChannelDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(renameGroupDraft)}
        title="Rename Channel Group"
        initialValue={renameGroupDraft?.currentName ?? ''}
        confirmLabel="Rename"
        onClose={() => setRenameGroupDraft(null)}
        onConfirm={async (value) => {
          if (!renameGroupDraft) return;
          await renameChannelGroup(renameGroupDraft.groupId, value);
          setRenameGroupDraft(null);
        }}
      />

      <QuickRenameDialog
        open={Boolean(createGroupDraft)}
        title="Create Channel Group"
        initialValue=""
        confirmLabel="Create"
        onClose={() => setCreateGroupDraft(null)}
        onConfirm={async (value) => {
          await createChannelGroup(value, createGroupDraft?.channelId ?? null);
          setCreateGroupDraft(null);
        }}
      />

      {showAccountModal && (
        <AccountSettingsModal
          userEmail={user.email ?? 'No email'}
          initialUsername={baseUserDisplayName}
          initialAvatarUrl={profileAvatarUrl}
          autoUpdateEnabled={appSettings.autoUpdateEnabled}
          updaterStatus={updaterStatus}
          updaterStatusLoading={updaterStatusLoading || appSettingsLoading}
          checkingForUpdates={checkingForUpdates}
          onClose={() => setShowAccountModal(false)}
          onSave={saveAccountSettings}
          onAutoUpdateChange={setAutoUpdateEnabled}
          onCheckForUpdates={checkForUpdatesNow}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
        />
      )}
    </>
  );
}


