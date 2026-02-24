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
import { playNotificationSound } from '@/lib/notifications/sound';
import { supabase } from '@/lib/supabase';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import { installPromptTrap } from '@/lib/contextMenu/debugTrace';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_NOTIFICATION_AUDIO_SETTINGS,
  DEFAULT_NOTIFICATION_COUNTS,
  DEFAULT_SOCIAL_COUNTS,
  DM_REPORT_REVIEW_PANEL_FLAG,
  ENABLE_CHANNEL_RELOAD_DIAGNOSTICS,
  FRIENDS_SOCIAL_PANEL_FLAG,
  MESSAGE_PAGE_SIZE,
  VOICE_HARDWARE_DEBUG_PANEL_FLAG,
  VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL,
} from '@/renderer/app/constants';
import type {
  FriendsPanelTab,
  PendingUiConfirmation,
  VoicePresenceStateRow,
  VoiceSidebarParticipant,
} from '@/renderer/app/types';
import { getPendingUiConfirmationCopy } from '@/renderer/app/ui-confirmations';
import {
  areVoiceParticipantListsEqual,
  getNotificationPayloadString,
  isEditableKeyboardTarget,
} from '@/renderer/app/utils';
import { useDesktopSettings } from '@/renderer/features/desktop/hooks/useDesktopSettings';
import { useCommunityWorkspace } from '@/renderer/features/community/hooks/useCommunityWorkspace';
import { useServerAdmin } from '@/renderer/features/community/hooks/useServerAdmin';
import { useChannelManagement } from '@/renderer/features/community/hooks/useChannelManagement';
import { useChannelGroups } from '@/renderer/features/community/hooks/useChannelGroups';
import { useMessages } from '@/renderer/features/messages/hooks/useMessages';
import { useFeatureFlags } from '@/renderer/features/session/hooks/useFeatureFlags';
import { usePlatformSession } from '@/renderer/features/session/hooks/usePlatformSession';
import type { NotificationAudioSettings } from '@/shared/desktop/types';
import type {
  AuthorProfile,
  BanEligibleServer,
  Channel,
  ChannelKind,
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
  MessageAttachment,
  MessageLinkPreview,
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
  MessageReaction,
  Message,
  SocialCounts,
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
  const {
    state: { featureFlags },
    derived: { hasFeatureFlag },
    actions: { resetFeatureFlags },
  } = useFeatureFlags({
    controlPlaneBackend,
    userId: user?.id,
  });
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
  const [canSpeakInVoiceChannel, setCanSpeakInVoiceChannel] = useState(false);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceHardwareDebugPanelOpen, setVoiceHardwareDebugPanelOpen] = useState(false);
  const [dmReportReviewPanelOpen, setDmReportReviewPanelOpen] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceSidebarParticipant[]>([]);
  const [voicePresenceByChannelId, setVoicePresenceByChannelId] = useState<
    Record<string, VoiceSidebarParticipant[]>
  >({});
  const [voiceSessionState, setVoiceSessionState] = useState({
    joined: false,
    joining: false,
    isMuted: false,
    isDeafened: false,
    listenOnly: true,
  });
  const [voiceControlActions, setVoiceControlActions] = useState<{
    join: () => void;
    leave: () => void;
    toggleMute: () => void;
    toggleDeafen: () => void;
  } | null>(null);
  const [voiceJoinPrompt, setVoiceJoinPrompt] = useState<{
    channelId: string;
    mode: 'join' | 'switch';
  } | null>(null);
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
      setRequestOlderMessagesLoader,
      clearRequestOlderMessagesLoader,
      getCachedChannelBundle,
      cacheChannelBundle,
      fetchMessageAttachmentsForMessageIds,
      fetchMessageLinkPreviewsForMessageIds,
      runMessageMediaMaintenance: runMessageMediaMaintenanceFromHook,
      getMessageLoadRuntime,
      isCurrentMessageLoad,
      syncOldestLoadedCursor,
      syncLoadedMessageWindow,
      loadLatestMessagesWithRelated,
      loadOlderMessagesWithRelated,
      finishOlderMessagesLoad,
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
    channels,
    setMessages,
    setMessageReactions,
    setMessageAttachments,
    setMessageLinkPreviews,
  });
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false);
  const [friendsPanelRequestedTab, setFriendsPanelRequestedTab] = useState<FriendsPanelTab | null>(null);
  const [friendsPanelHighlightedRequestId, setFriendsPanelHighlightedRequestId] = useState<string | null>(
    null
  );
  const [workspaceMode, setWorkspaceMode] = useState<'community' | 'dm'>('community');
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>(
    DEFAULT_NOTIFICATION_COUNTS
  );
  const [socialCounts, setSocialCounts] = useState<SocialCounts>(DEFAULT_SOCIAL_COUNTS);
  const [dmConversations, setDmConversations] = useState<DirectMessageConversationSummary[]>([]);
  const [dmConversationsLoading, setDmConversationsLoading] = useState(false);
  const [dmConversationsRefreshing, setDmConversationsRefreshing] = useState(false);
  const [dmConversationsError, setDmConversationsError] = useState<string | null>(null);
  const [selectedDmConversationId, setSelectedDmConversationId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmMessagesLoading, setDmMessagesLoading] = useState(false);
  const [dmMessagesRefreshing, setDmMessagesRefreshing] = useState(false);
  const [dmMessagesError, setDmMessagesError] = useState<string | null>(null);
  const [dmMessageSendPending, setDmMessageSendPending] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsRefreshing, setNotificationsRefreshing] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(
    null
  );
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false);
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState<string | null>(null);
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
  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});
  const dmReadMarkInFlightRef = useRef<Record<string, boolean>>({});
  const dmLastReadMarkAtRef = useRef<Record<string, number>>({});
  const knownNotificationRecipientIdsRef = useRef<Set<string>>(new Set());
  const notificationsBootstrappedRef = useRef(false);
  const notificationAudioSettingsRef = useRef<NotificationAudioSettings>(
    DEFAULT_NOTIFICATION_AUDIO_SETTINGS
  );
  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS || hasFeatureFlag('debug_channel_reload_diagnostics');
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;
  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === 'dm';
  const dmReportReviewPanelEnabled = isPlatformStaff && hasFeatureFlag(DM_REPORT_REVIEW_PANEL_FLAG);
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(VOICE_HARDWARE_DEBUG_PANEL_FLAG);

  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (friendsSocialPanelEnabled) return;
    setFriendsPanelOpen(false);
    setWorkspaceMode('community');
    setSelectedDmConversationId(null);
    setDmConversations([]);
    setDmMessages([]);
  }, [friendsSocialPanelEnabled]);

  useEffect(() => {
    if (dmReportReviewPanelEnabled) return;
    setDmReportReviewPanelOpen(false);
  }, [dmReportReviewPanelEnabled]);

  useEffect(() => {
    if (voiceHardwareDebugPanelEnabled) return;
    setVoiceHardwareDebugPanelOpen(false);
  }, [voiceHardwareDebugPanelEnabled]);

  useEffect(() => {
    if (!user || !voiceHardwareDebugPanelEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.ctrlKey || event.metaKey) || !event.altKey || !event.shiftKey) return;
      if (event.key.toLowerCase() !== 'v') return;
      if (isEditableKeyboardTarget(event.target)) return;

      event.preventDefault();
      setVoiceHardwareDebugPanelOpen((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [user, voiceHardwareDebugPanelEnabled]);

  useEffect(() => {
    if (user) return;

    resetPlatformSession();
    setCanSpeakInVoiceChannel(false);
    setActiveVoiceChannelId(null);
    setVoicePanelOpen(false);
    setVoiceHardwareDebugPanelOpen(false);
    setDmReportReviewPanelOpen(false);
    setNotificationsPanelOpen(false);
    setFriendsPanelOpen(false);
    setWorkspaceMode('community');
    setVoiceConnected(false);
    setVoiceParticipants([]);
    setVoicePresenceByChannelId({});
    setVoiceSessionState({
      joined: false,
      joining: false,
      isMuted: false,
      isDeafened: false,
      listenOnly: true,
    });
    setVoiceControlActions(null);
    setVoiceJoinPrompt(null);
    resetMessageState();
    setAuthorProfiles({});
    authorProfileCacheRef.current = {};
    knownNotificationRecipientIdsRef.current = new Set();
    notificationsBootstrappedRef.current = false;
    resetFeatureFlags();
    setNotificationItems([]);
    setNotificationCounts(DEFAULT_NOTIFICATION_COUNTS);
    setSocialCounts(DEFAULT_SOCIAL_COUNTS);
    setDmConversations([]);
    setDmConversationsLoading(false);
    setDmConversationsRefreshing(false);
    setDmConversationsError(null);
    setSelectedDmConversationId(null);
    setDmMessages([]);
    setDmMessagesLoading(false);
    setDmMessagesRefreshing(false);
    setDmMessagesError(null);
    setDmMessageSendPending(false);
    setNotificationsLoading(false);
    setNotificationsRefreshing(false);
    setNotificationsError(null);
    setNotificationPreferences(null);
    setNotificationPreferencesLoading(false);
    setNotificationPreferencesSaving(false);
    setNotificationPreferencesError(null);
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
    resetPlatformSession,
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
    resetServerPermissions,
    user,
  ]);

  useEffect(() => {
    notificationAudioSettingsRef.current = appSettings.notifications;
  }, [appSettings.notifications]);

  const refreshSocialCounts = React.useCallback(async () => {
    if (!user?.id || !friendsSocialPanelEnabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      return;
    }

    const nextCounts = await socialBackend.getSocialCounts();
    setSocialCounts(nextCounts);
  }, [friendsSocialPanelEnabled, socialBackend, user?.id]);

  const refreshNotificationInbox = React.useCallback(
    async (options?: { playSoundsForNew?: boolean }) => {
      if (!user?.id) return;

      const playSoundsForNew = Boolean(options?.playSoundsForNew);
      const [items, counts] = await Promise.all([
        notificationBackend.listNotifications({ limit: 50 }),
        notificationBackend.getNotificationCounts(),
      ]);

      const nextKnownIds = new Set(items.map((item) => item.recipientId));
      const previousKnownIds = knownNotificationRecipientIdsRef.current;
      const canPlaySounds = notificationsBootstrappedRef.current && playSoundsForNew;

      setNotificationItems(items);
      setNotificationCounts(counts);
      knownNotificationRecipientIdsRef.current = nextKnownIds;

      if (canPlaySounds) {
        for (const item of items) {
          if (previousKnownIds.has(item.recipientId)) continue;
          if (item.dismissedAt) continue;
          void playNotificationSound({
            kind: item.kind,
            deliverSound: item.deliverSound,
            audioSettings: notificationAudioSettingsRef.current,
          });
        }
      }

      notificationsBootstrappedRef.current = true;
    },
    [notificationBackend, user?.id]
  );

  const refreshNotificationPreferences = React.useCallback(async () => {
    if (!user?.id) return;
    const preferences = await notificationBackend.getNotificationPreferences();
    setNotificationPreferences(preferences);
  }, [notificationBackend, user?.id]);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      return () => {
        isMounted = false;
      };
    }

    setNotificationsLoading(true);
    setNotificationsError(null);
    notificationsBootstrappedRef.current = false;
    knownNotificationRecipientIdsRef.current = new Set();

    const loadInbox = async () => {
      try {
        await refreshNotificationInbox({ playSoundsForNew: false });
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load notification inbox:', error);
        setNotificationsError(getErrorMessage(error, 'Failed to load notifications.'));
      } finally {
        if (!isMounted) return;
        setNotificationsLoading(false);
      }
    };

    void loadInbox();

    return () => {
      isMounted = false;
    };
  }, [refreshNotificationInbox, user?.id]);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      return () => {
        isMounted = false;
      };
    }

    setNotificationPreferencesLoading(true);
    setNotificationPreferencesError(null);

    const loadPreferences = async () => {
      try {
        const preferences = await notificationBackend.getNotificationPreferences();
        if (!isMounted) return;
        setNotificationPreferences(preferences);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load notification preferences:', error);
        setNotificationPreferencesError(getErrorMessage(error, 'Failed to load notification preferences.'));
      } finally {
        if (!isMounted) return;
        setNotificationPreferencesLoading(false);
      }
    };

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [notificationBackend, refreshNotificationPreferences, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const subscription = notificationBackend.subscribeToNotificationInbox(user.id, () => {
      setNotificationsRefreshing(true);
      void refreshNotificationInbox({ playSoundsForNew: true })
        .catch((error) => {
          console.error('Failed to refresh notifications after realtime update:', error);
          setNotificationsError(getErrorMessage(error, 'Failed to refresh notifications.'));
        })
        .finally(() => {
          setNotificationsRefreshing(false);
        });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [notificationBackend, refreshNotificationInbox, user?.id]);

  useEffect(() => {
    if (!notificationsPanelOpen || !user?.id) return;
    if (notificationCounts.unseenCount <= 0) return;

    void notificationBackend
      .markAllNotificationsSeen()
      .then(() => refreshNotificationInbox({ playSoundsForNew: false }))
      .catch((error) => {
        console.error('Failed to mark notifications seen:', error);
      });
  }, [
    notificationBackend,
    notificationCounts.unseenCount,
    notificationsPanelOpen,
    refreshNotificationInbox,
    user?.id,
  ]);

  useEffect(() => {
    let isMounted = true;

    if (!user?.id || !friendsSocialPanelEnabled) {
      setSocialCounts(DEFAULT_SOCIAL_COUNTS);
      return () => {
        isMounted = false;
      };
    }

    void refreshSocialCounts().catch((error) => {
      if (!isMounted) return;
      console.error('Failed to load social counts:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [friendsSocialPanelEnabled, refreshSocialCounts, user?.id]);

  useEffect(() => {
    if (!user?.id || !friendsSocialPanelEnabled) return;

    const subscription = socialBackend.subscribeToSocialGraph(user.id, () => {
      void refreshSocialCounts().catch((error) => {
        console.error('Failed to refresh social counts after realtime update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [friendsSocialPanelEnabled, refreshSocialCounts, socialBackend, user?.id]);

  const refreshDmConversations = React.useCallback(
    async (options?: { suppressLoadingState?: boolean }) => {
      if (!user?.id || !dmWorkspaceEnabled) {
        setDmConversations([]);
        return;
      }

      if (options?.suppressLoadingState) {
        setDmConversationsRefreshing(true);
      } else {
        setDmConversationsLoading(true);
      }
      setDmConversationsError(null);

      try {
        const conversations = await directMessageBackend.listConversations();
        setDmConversations(conversations);
      } catch (error) {
        setDmConversationsError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        setDmConversationsLoading(false);
        setDmConversationsRefreshing(false);
      }
    },
    [directMessageBackend, dmWorkspaceEnabled, user?.id]
  );

  const refreshDmMessages = React.useCallback(
    async (conversationId: string, options?: { suppressLoadingState?: boolean; markRead?: boolean }) => {
      if (!user?.id || !dmWorkspaceEnabled || !conversationId) {
        setDmMessages([]);
        return;
      }

      if (options?.suppressLoadingState) {
        setDmMessagesRefreshing(true);
      } else {
        setDmMessagesLoading(true);
      }
      setDmMessagesError(null);

      try {
        const messages = await directMessageBackend.listMessages({
          conversationId,
          limit: 100,
        });
        if (selectedDmConversationId !== conversationId) {
          return;
        }
        setDmMessages(messages);

        if (options?.markRead !== false) {
          const now = Date.now();
          const lastMarkedAt = dmLastReadMarkAtRef.current[conversationId] ?? 0;
          const recentlyMarked = now - lastMarkedAt < 1500;
          const inFlight = Boolean(dmReadMarkInFlightRef.current[conversationId]);
          if (!recentlyMarked && !inFlight) {
            dmReadMarkInFlightRef.current[conversationId] = true;
            try {
              await directMessageBackend.markConversationRead(conversationId);
              dmLastReadMarkAtRef.current[conversationId] = Date.now();
            } finally {
              dmReadMarkInFlightRef.current[conversationId] = false;
            }
          }
        }
      } catch (error) {
        if (selectedDmConversationId !== conversationId) return;
        setDmMessagesError(getErrorMessage(error, 'Failed to load direct messages.'));
      } finally {
        if (selectedDmConversationId !== conversationId) return;
        setDmMessagesLoading(false);
        setDmMessagesRefreshing(false);
      }
    },
    [directMessageBackend, dmWorkspaceEnabled, selectedDmConversationId, user?.id]
  );

  useEffect(() => {
    let isMounted = true;

    if (!user?.id || !dmWorkspaceEnabled) {
      setDmConversations([]);
      setSelectedDmConversationId(null);
      return () => {
        isMounted = false;
      };
    }

    void refreshDmConversations().catch((error) => {
      if (!isMounted) return;
      console.error('Failed to initialize DM conversations:', error);
    });

    return () => {
      isMounted = false;
    };
  }, [dmWorkspaceEnabled, refreshDmConversations, user?.id]);

  useEffect(() => {
    if (!dmWorkspaceIsActive) return;
    if (selectedDmConversationId) {
      const stillExists = dmConversations.some(
        (conversation) => conversation.conversationId === selectedDmConversationId
      );
      if (!stillExists) {
        setSelectedDmConversationId(dmConversations[0]?.conversationId ?? null);
      }
      return;
    }

    if (dmConversations.length > 0) {
      setSelectedDmConversationId(dmConversations[0].conversationId);
    }
  }, [dmConversations, dmWorkspaceIsActive, selectedDmConversationId]);

  useEffect(() => {
    if (!user?.id || !dmWorkspaceEnabled) return;

    const subscription = directMessageBackend.subscribeToConversations(user.id, () => {
      void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
        console.error('Failed to refresh DM conversations after realtime update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [
    directMessageBackend,
    dmWorkspaceEnabled,
    refreshDmConversations,
    refreshDmMessages,
    selectedDmConversationId,
    dmWorkspaceIsActive,
    user?.id,
  ]);

  useEffect(() => {
    if (!dmWorkspaceIsActive || !selectedDmConversationId || !user?.id) {
      setDmMessages([]);
      setDmMessagesLoading(false);
      setDmMessagesRefreshing(false);
      setDmMessagesError(null);
      return;
    }

    void refreshDmMessages(selectedDmConversationId, { markRead: true }).catch((error) => {
      console.error('Failed to load selected DM conversation:', error);
    });
  }, [dmWorkspaceIsActive, refreshDmMessages, selectedDmConversationId, user?.id]);

  useEffect(() => {
    if (!dmWorkspaceIsActive || !selectedDmConversationId) return;

    const subscription = directMessageBackend.subscribeToMessages(selectedDmConversationId, () => {
      void refreshDmMessages(selectedDmConversationId, {
        suppressLoadingState: true,
        markRead: false,
      }).catch((error) => {
        console.error('Failed to refresh DM messages after realtime update:', error);
      });
      void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
        console.error('Failed to refresh DM conversations after message update:', error);
      });
    });

    return () => {
      void subscription.unsubscribe();
    };
  }, [
    directMessageBackend,
    dmWorkspaceIsActive,
    refreshDmConversations,
    refreshDmMessages,
    selectedDmConversationId,
  ]);

  // Reset server-scoped UI when no server is selected
  useEffect(() => {
    if (!currentServerId) {
      resetChannelsWorkspace();
      setActiveVoiceChannelId(null);
      setVoicePanelOpen(false);
      setVoiceConnected(false);
      setVoiceParticipants([]);
      setVoicePresenceByChannelId({});
      setVoiceSessionState({
        joined: false,
        joining: false,
        isMuted: false,
        isDeafened: false,
        listenOnly: true,
      });
      setVoiceControlActions(null);
      setVoiceJoinPrompt(null);
      setMessages([]);
      setMessageReactions([]);
      setMessageAttachments([]);
      setMessageLinkPreviews([]);
      setAuthorProfiles({});
      setCanSpeakInVoiceChannel(false);
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
    resetServerSettingsState,
    resetServerRoleManagement,
    resetServerInvites,
  ]);

  useEffect(() => {
    if (!activeVoiceChannelId) return;

    const activeVoiceChannel = channels.find(
      (channel) => channel.id === activeVoiceChannelId && channel.kind === 'voice'
    );

    if (!activeVoiceChannel) {
      setActiveVoiceChannelId(null);
      setVoiceConnected(false);
      setVoiceParticipants([]);
      setVoicePanelOpen(false);
    }
  }, [activeVoiceChannelId, channels]);

  useEffect(() => {
    if (!activeVoiceChannelId) return;
    setVoicePanelOpen(false);
  }, [activeVoiceChannelId]);

  useEffect(() => {
    if (!currentServerId || !user?.id) {
      setVoicePresenceByChannelId({});
      return;
    }

    const voiceChannelIds = channels
      .filter((channel) => channel.kind === 'voice')
      .map((channel) => channel.id)
      .filter((channelId) => channelId !== activeVoiceChannelId);

    setVoicePresenceByChannelId((prev) => {
      const nextEntries = Object.entries(prev).filter(([channelId]) =>
        voiceChannelIds.includes(channelId)
      );
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });

    if (voiceChannelIds.length === 0) {
      return;
    }

    let disposed = false;

    const subscriptionChannels = voiceChannelIds.map((voiceChannelId) => {
      const subscriptionChannel = supabase.channel(`voice:${currentServerId}:${voiceChannelId}`);

      const syncPresenceState = () => {
        if (disposed) return;

        const presenceState = subscriptionChannel.presenceState() as Record<
          string,
          VoicePresenceStateRow[]
        >;
        const participantsByUserId = new Map<string, VoiceSidebarParticipant>();

        for (const [presenceKey, presenceRows] of Object.entries(presenceState)) {
          const latestPresence = presenceRows[presenceRows.length - 1];
          if (!latestPresence) continue;

          const userId = latestPresence.user_id ?? presenceKey;
          if (!userId) continue;

          const trimmedDisplayName = latestPresence.display_name?.trim() ?? '';
          const displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : userId.slice(0, 12);

          if (!participantsByUserId.has(userId)) {
            participantsByUserId.set(userId, {
              userId,
              displayName,
            });
          }
        }

        const nextParticipants = Array.from(participantsByUserId.values()).sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        );

        setVoicePresenceByChannelId((prev) => {
          const previousParticipants = prev[voiceChannelId] ?? [];
          if (areVoiceParticipantListsEqual(previousParticipants, nextParticipants)) {
            return prev;
          }
          return {
            ...prev,
            [voiceChannelId]: nextParticipants,
          };
        });
      };

      subscriptionChannel
        .on('presence', { event: 'sync' }, syncPresenceState)
        .on('presence', { event: 'join' }, syncPresenceState)
        .on('presence', { event: 'leave' }, syncPresenceState);

      subscriptionChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          syncPresenceState();
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') {
          return;
        }

        if (disposed) return;
        setVoicePresenceByChannelId((prev) => {
          const previousParticipants = prev[voiceChannelId];
          if (!previousParticipants || previousParticipants.length === 0) {
            return prev;
          }
          return {
            ...prev,
            [voiceChannelId]: [],
          };
        });
      });

      return subscriptionChannel;
    });

    return () => {
      disposed = true;
      for (const subscriptionChannel of subscriptionChannels) {
        void supabase.removeChannel(subscriptionChannel);
      }
    };
  }, [activeVoiceChannelId, channels, currentServerId, user?.id]);

  useEffect(() => {
    if (!currentChannelId) return;

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'voice') return;

    const firstTextChannel = channels.find((channel) => channel.kind === 'text');
    if (firstTextChannel) {
      setCurrentChannelId(firstTextChannel.id);
    }
  }, [currentChannelId, channels]);

  // Load messages when channel changes
  useEffect(() => {
    let isMounted = true;

    if (!user || !currentServerId || !currentChannelId) {
      resetMessageState();
      setAuthorProfiles({});
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.community_id !== currentServerId) {
      return;
    }

    if (selectedChannel.kind !== 'text') {
      resetMessageState();
      setAuthorProfiles({});
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    let activeLoadPromise: Promise<void> | null = null;
    let scheduledReloadTimerId: number | null = null;
    const pendingReloadReasons = new Set<string>();
    let currentMessageList: Message[] = [];
    let currentReactionList: MessageReaction[] = [];
    let currentAttachmentList: MessageAttachment[] = [];
    let currentLinkPreviewList: MessageLinkPreview[] = [];
    let latestAuthorSyncId = 0;
    let pendingAttachmentRefreshTimerId: number | null = null;
    let pendingLinkPreviewRefreshTimerId: number | null = null;
    let attachmentRefreshInFlight = false;
    let linkPreviewRefreshInFlight = false;
    const pendingAttachmentRefreshMessageIds = new Set<string>();
    const pendingLinkPreviewRefreshMessageIds = new Set<string>();

    const logReload = (event: string, details?: Record<string, unknown>) => {
      if (!debugChannelReloads) return;
      console.debug(`[chat-reload] ${event}`, {
        channelId: currentChannelId,
        serverId: currentServerId,
        ...details,
      });
    };

    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    const getStringField = (value: unknown, key: string): string | null => {
      const record = asRecord(value);
      if (!record) return null;
      const candidate = record[key];
      return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
    };

    const getNullableStringField = (value: unknown, key: string): string | null => {
      const record = asRecord(value);
      if (!record) return null;
      const candidate = record[key];
      if (candidate == null) return null;
      return typeof candidate === 'string' ? candidate : null;
    };

    const getRealtimeEventType = (payload: unknown): 'INSERT' | 'UPDATE' | 'DELETE' | null => {
      const eventType = getStringField(payload, 'eventType');
      if (eventType === 'INSERT' || eventType === 'UPDATE' || eventType === 'DELETE') return eventType;
      return null;
    };

    const getRealtimeNewRow = (payload: unknown): Record<string, unknown> | null =>
      asRecord(asRecord(payload)?.new);
    const getRealtimeOldRow = (payload: unknown): Record<string, unknown> | null =>
      asRecord(asRecord(payload)?.old);

    const compareMessagesAsc = (left: Message, right: Message): number => {
      if (left.created_at < right.created_at) return -1;
      if (left.created_at > right.created_at) return 1;
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    };

    const persistCurrentChannelBundleCache = () => {
      const { hasOlderMessages: runtimeHasOlderMessages } = getMessageLoadRuntime();
      cacheChannelBundle(currentServerId, currentChannelId, {
        messages: currentMessageList,
        reactions: currentReactionList,
        attachments: currentAttachmentList,
        linkPreviews: currentLinkPreviewList,
        hasOlderMessages: runtimeHasOlderMessages,
      });
    };

    const updateAuthorProfilesForMessages = async (messageList: Message[]) => {
      const authorIds = Array.from(
        new Set(
          messageList
            .map((message) => message.author_user_id)
            .filter((authorId): authorId is string => Boolean(authorId))
        )
      );

      if (authorIds.length === 0) {
        if (!isMounted) return { authorCount: 0, fetchedAuthorCount: 0 };
        setAuthorProfiles({});
        return { authorCount: 0, fetchedAuthorCount: 0 };
      }

      const missingAuthorIds = authorIds.filter((authorId) => !authorProfileCacheRef.current[authorId]);
      if (missingAuthorIds.length > 0) {
        const fetchedProfiles = await communityBackend.fetchAuthorProfiles(missingAuthorIds);
        authorProfileCacheRef.current = {
          ...authorProfileCacheRef.current,
          ...fetchedProfiles,
        };
      }

      const profileMap: Record<string, AuthorProfile> = {};
      for (const authorId of authorIds) {
        const cachedProfile = authorProfileCacheRef.current[authorId];
        if (cachedProfile) {
          profileMap[authorId] = cachedProfile;
        }
      }

      if (!isMounted) return { authorCount: authorIds.length, fetchedAuthorCount: missingAuthorIds.length };
      setAuthorProfiles(profileMap);
      return { authorCount: authorIds.length, fetchedAuthorCount: missingAuthorIds.length };
    };

    const updateMessageBundleState = async (input: {
      reason: string;
      loadId: number;
      startedAt: number;
      messageList: Message[];
      reactionList: MessageReaction[];
      attachmentList: MessageAttachment[];
      linkPreviewList: MessageLinkPreview[];
      hasOlder: boolean;
    }) => {
      if (!isMounted || !isCurrentMessageLoad(input.loadId)) return;

      currentMessageList = input.messageList;
      currentReactionList = input.reactionList;
      currentAttachmentList = input.attachmentList;
      currentLinkPreviewList = input.linkPreviewList;
      syncLoadedMessageWindow(input.messageList, input.hasOlder);

      setMessages(input.messageList);
      setMessageReactions(input.reactionList);
      setMessageAttachments(input.attachmentList);
      setMessageLinkPreviews(input.linkPreviewList);
      persistCurrentChannelBundleCache();

      const { authorCount, fetchedAuthorCount } = await updateAuthorProfilesForMessages(input.messageList);
      if (!isMounted || !isCurrentMessageLoad(input.loadId)) return;

      logReload('load:success', {
        reason: input.reason,
        loadId: input.loadId,
        durationMs: Date.now() - input.startedAt,
        messageCount: input.messageList.length,
        authorCount,
        fetchedAuthorCount,
        hasOlderMessages: input.hasOlder,
      });
    };

    const scheduleAuthorProfileSyncForCurrentMessages = (reason: string) => {
      const authorSyncId = ++latestAuthorSyncId;
      const messageSnapshot = [...currentMessageList];
      void (async () => {
        try {
          const { authorCount, fetchedAuthorCount } = await updateAuthorProfilesForMessages(messageSnapshot);
          if (!isMounted || authorSyncId !== latestAuthorSyncId) return;
          logReload('authors:sync', {
            reason,
            messageCount: messageSnapshot.length,
            authorCount,
            fetchedAuthorCount,
          });
        } catch (error) {
          if (!isMounted || authorSyncId !== latestAuthorSyncId) return;
          console.warn('Failed to sync author profiles after incremental message change:', error);
        }
      })();
    };

    const commitMessages = (nextMessages: Message[], reason: string) => {
      currentMessageList = nextMessages;
      syncOldestLoadedCursor(nextMessages);
      persistCurrentChannelBundleCache();
      if (!isMounted) return;
      setMessages(nextMessages);
      scheduleAuthorProfileSyncForCurrentMessages(reason);
    };

    const commitReactions = (nextReactions: MessageReaction[]) => {
      currentReactionList = nextReactions;
      persistCurrentChannelBundleCache();
      if (!isMounted) return;
      setMessageReactions(nextReactions);
    };

    const commitAttachments = (nextAttachments: MessageAttachment[]) => {
      currentAttachmentList = nextAttachments;
      persistCurrentChannelBundleCache();
      if (!isMounted) return;
      setMessageAttachments(nextAttachments);
    };

    const commitLinkPreviews = (nextLinkPreviews: MessageLinkPreview[]) => {
      currentLinkPreviewList = nextLinkPreviews;
      persistCurrentChannelBundleCache();
      if (!isMounted) return;
      setMessageLinkPreviews(nextLinkPreviews);
    };

    const hydrateChannelBundleFromCache = () => {
      const cachedBundle = getCachedChannelBundle(currentServerId, currentChannelId);
      if (!cachedBundle) return false;

      currentMessageList = cachedBundle.messages;
      currentReactionList = cachedBundle.reactions;
      currentAttachmentList = cachedBundle.attachments;
      currentLinkPreviewList = cachedBundle.linkPreviews;
      syncLoadedMessageWindow(cachedBundle.messages, cachedBundle.hasOlderMessages);

      if (!isMounted) return true;
      setMessages(cachedBundle.messages);
      setMessageReactions(cachedBundle.reactions);
      setMessageAttachments(cachedBundle.attachments);
      setMessageLinkPreviews(cachedBundle.linkPreviews);
      scheduleAuthorProfileSyncForCurrentMessages('channel_cache_hydrate');
      logReload('cache:hydrate', {
        messageCount: cachedBundle.messages.length,
        hasOlderMessages: cachedBundle.hasOlderMessages,
      });
      return true;
    };

    const mergeAttachmentsForMessageIds = async (messageIds: string[]) => {
      const uniqueMessageIds = Array.from(
        new Set(
          messageIds.filter((messageId) =>
            currentMessageList.some((message) => message.id === messageId)
          )
        )
      );
      if (uniqueMessageIds.length === 0) return;

      const refreshedRows = await fetchMessageAttachmentsForMessageIds(uniqueMessageIds);

      const nextAttachments = [
        ...currentAttachmentList.filter((attachment) => !uniqueMessageIds.includes(attachment.messageId)),
        ...refreshedRows,
      ].sort((left, right) => {
        if (left.createdAt < right.createdAt) return -1;
        if (left.createdAt > right.createdAt) return 1;
        if (left.id < right.id) return -1;
        if (left.id > right.id) return 1;
        return 0;
      });

      commitAttachments(nextAttachments);
    };

    const mergeLinkPreviewsForMessageIds = async (messageIds: string[]) => {
      const uniqueMessageIds = Array.from(
        new Set(
          messageIds.filter((messageId) =>
            currentMessageList.some((message) => message.id === messageId)
          )
        )
      );
      if (uniqueMessageIds.length === 0) return;

      const refreshedRows = await fetchMessageLinkPreviewsForMessageIds(uniqueMessageIds);

      const nextLinkPreviews = [
        ...currentLinkPreviewList.filter((preview) => !uniqueMessageIds.includes(preview.messageId)),
        ...refreshedRows,
      ].sort((left, right) => {
        if (left.createdAt < right.createdAt) return -1;
        if (left.createdAt > right.createdAt) return 1;
        if (left.id < right.id) return -1;
        if (left.id > right.id) return 1;
        return 0;
      });

      commitLinkPreviews(nextLinkPreviews);
    };

    const flushAttachmentRefreshQueue = () => {
      if (!isMounted) return;
      if (attachmentRefreshInFlight) return;
      if (pendingAttachmentRefreshMessageIds.size === 0) return;

      const messageIds = Array.from(pendingAttachmentRefreshMessageIds);
      pendingAttachmentRefreshMessageIds.clear();
      attachmentRefreshInFlight = true;

      void mergeAttachmentsForMessageIds(messageIds)
        .catch((error) => {
          console.warn('Failed to incrementally refresh message attachments:', error);
          scheduleMessageReload('attachments_sub_fallback', 20);
        })
        .finally(() => {
          attachmentRefreshInFlight = false;
          if (!isMounted) return;
          if (pendingAttachmentRefreshMessageIds.size > 0 && pendingAttachmentRefreshTimerId === null) {
            pendingAttachmentRefreshTimerId = window.setTimeout(() => {
              pendingAttachmentRefreshTimerId = null;
              flushAttachmentRefreshQueue();
            }, 25);
          }
        });
    };

    const queueAttachmentRefresh = (messageId: string) => {
      if (!messageId) return;
      pendingAttachmentRefreshMessageIds.add(messageId);
      if (pendingAttachmentRefreshTimerId !== null) return;
      pendingAttachmentRefreshTimerId = window.setTimeout(() => {
        pendingAttachmentRefreshTimerId = null;
        flushAttachmentRefreshQueue();
      }, 25);
    };

    const flushLinkPreviewRefreshQueue = () => {
      if (!isMounted) return;
      if (linkPreviewRefreshInFlight) return;
      if (pendingLinkPreviewRefreshMessageIds.size === 0) return;

      const messageIds = Array.from(pendingLinkPreviewRefreshMessageIds);
      pendingLinkPreviewRefreshMessageIds.clear();
      linkPreviewRefreshInFlight = true;

      void mergeLinkPreviewsForMessageIds(messageIds)
        .catch((error) => {
          console.warn('Failed to incrementally refresh message link previews:', error);
          scheduleMessageReload('previews_sub_fallback', 20);
        })
        .finally(() => {
          linkPreviewRefreshInFlight = false;
          if (!isMounted) return;
          if (pendingLinkPreviewRefreshMessageIds.size > 0 && pendingLinkPreviewRefreshTimerId === null) {
            pendingLinkPreviewRefreshTimerId = window.setTimeout(() => {
              pendingLinkPreviewRefreshTimerId = null;
              flushLinkPreviewRefreshQueue();
            }, 25);
          }
        });
    };

    const queueLinkPreviewRefresh = (messageId: string) => {
      if (!messageId) return;
      pendingLinkPreviewRefreshMessageIds.add(messageId);
      if (pendingLinkPreviewRefreshTimerId !== null) return;
      pendingLinkPreviewRefreshTimerId = window.setTimeout(() => {
        pendingLinkPreviewRefreshTimerId = null;
        flushLinkPreviewRefreshQueue();
      }, 25);
    };

    const parseReactionFromRow = (row: Record<string, unknown> | null): MessageReaction | null => {
      if (!row) return null;
      const id = getStringField(row, 'id');
      const messageId = getStringField(row, 'message_id');
      const userId = getStringField(row, 'user_id');
      const emoji = getStringField(row, 'emoji');
      const createdAt = getStringField(row, 'created_at');
      if (!id || !messageId || !userId || !emoji || !createdAt) return null;
      return { id, messageId, userId, emoji, createdAt };
    };

    const getAffectedMessageIdFromRealtimePayload = (
      payload: unknown,
      currentRows: { id: string; messageId: string }[]
    ): string | null => {
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const directMessageId =
        getStringField(nextRow, 'message_id') ?? getStringField(oldRow, 'message_id');
      if (directMessageId) return directMessageId;

      const rowId = getStringField(nextRow, 'id') ?? getStringField(oldRow, 'id');
      if (!rowId) return null;
      return currentRows.find((row) => row.id === rowId)?.messageId ?? null;
    };

    const applyIncrementalMessageChange = (payload: unknown): boolean => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) return false;

      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);
      const rowRecord = eventType === 'DELETE' ? oldRow : nextRow;
      const messageId = getStringField(rowRecord, 'id');
      if (!messageId) return false;

      if (eventType === 'DELETE') {
        if (!currentMessageList.some((message) => message.id === messageId)) return true;
        commitMessages(
          currentMessageList.filter((message) => message.id !== messageId),
          'messages_sub_delete'
        );
        commitReactions(currentReactionList.filter((reaction) => reaction.messageId !== messageId));
        commitAttachments(currentAttachmentList.filter((attachment) => attachment.messageId !== messageId));
        commitLinkPreviews(currentLinkPreviewList.filter((preview) => preview.messageId !== messageId));
        return true;
      }

      const deletedAt = getNullableStringField(nextRow, 'deleted_at');
      if (deletedAt) {
        if (!currentMessageList.some((message) => message.id === messageId)) return true;
        commitMessages(
          currentMessageList.filter((message) => message.id !== messageId),
          'messages_sub_soft_delete'
        );
        commitReactions(currentReactionList.filter((reaction) => reaction.messageId !== messageId));
        commitAttachments(currentAttachmentList.filter((attachment) => attachment.messageId !== messageId));
        commitLinkPreviews(currentLinkPreviewList.filter((preview) => preview.messageId !== messageId));
        return true;
      }

      if (!nextRow) return false;
      const messageRow = nextRow as unknown as Message;
      const existingIndex = currentMessageList.findIndex((message) => message.id === messageId);
      const nextMessages = [...currentMessageList];
      if (existingIndex >= 0) {
        nextMessages[existingIndex] = messageRow;
      } else {
        nextMessages.push(messageRow);
      }
      nextMessages.sort(compareMessagesAsc);
      commitMessages(nextMessages, existingIndex >= 0 ? 'messages_sub_update' : 'messages_sub_insert');
      return true;
    };

    const applyIncrementalReactionChange = (payload: unknown): boolean => {
      const eventType = getRealtimeEventType(payload);
      if (!eventType) return false;
      const nextRow = getRealtimeNewRow(payload);
      const oldRow = getRealtimeOldRow(payload);

      if (eventType === 'DELETE') {
        const reactionId = getStringField(oldRow, 'id');
        if (!reactionId) return false;
        if (!currentReactionList.some((reaction) => reaction.id === reactionId)) return true;
        commitReactions(currentReactionList.filter((reaction) => reaction.id !== reactionId));
        return true;
      }

      const reactionRow = parseReactionFromRow(nextRow);
      if (!reactionRow) return false;
      if (!currentMessageList.some((message) => message.id === reactionRow.messageId)) return true;

      const existingIndex = currentReactionList.findIndex((reaction) => reaction.id === reactionRow.id);
      const nextReactions = [...currentReactionList];
      if (existingIndex >= 0) {
        nextReactions[existingIndex] = reactionRow;
      } else {
        nextReactions.push(reactionRow);
      }
      nextReactions.sort((left, right) => {
        if (left.createdAt < right.createdAt) return -1;
        if (left.createdAt > right.createdAt) return 1;
        if (left.id < right.id) return -1;
        if (left.id > right.id) return 1;
        return 0;
      });
      commitReactions(nextReactions);
      return true;
    };

    const loadMessages = async (reason: string) => {
      let loadId: number | null = null;
      let startedAt = Date.now();
      try {
        const loadedBundle = await loadLatestMessagesWithRelated(currentMessageList.length);
        loadId = loadedBundle.loadId;
        startedAt = loadedBundle.startedAt;
        logReload('load:start', { reason, loadId });

        await updateMessageBundleState({
          reason,
          loadId: loadedBundle.loadId,
          startedAt: loadedBundle.startedAt,
          messageList: loadedBundle.messageList,
          reactionList: loadedBundle.reactionList,
          attachmentList: loadedBundle.attachmentList,
          linkPreviewList: loadedBundle.linkPreviewList,
          hasOlder: loadedBundle.hasOlder,
        });
      } catch (error) {
        if (loadId == null) {
          if (isMounted) {
            console.error('Error loading messages:', error);
          }
          return;
        }
        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        console.error('Error loading messages:', error);
        logReload('load:error', {
          reason,
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const loadOlderMessages = async () => {
      if (!isMounted) return;
      let loadResult:
        | Awaited<ReturnType<typeof loadOlderMessagesWithRelated>>
        | null = null;
      let loadId: number | null = null;
      let startedAt = Date.now();

      try {
        loadResult = await loadOlderMessagesWithRelated(currentMessageList);
        if (loadResult.kind === 'skipped') return;

        loadId = loadResult.loadId;
        startedAt = loadResult.startedAt;
        logReload('load-older:start', {
          loadId,
          cursorCreatedAt: loadResult.oldestLoadedCursor.createdAt,
          cursorId: loadResult.oldestLoadedCursor.id,
          currentMessageCount: currentMessageList.length,
        });

        if (loadResult.kind === 'no_more') {
          if (!isMounted || !isCurrentMessageLoad(loadId)) return;
          syncLoadedMessageWindow(currentMessageList, false);
          logReload('load-older:complete', {
            loadId,
            addedCount: 0,
            durationMs: Date.now() - startedAt,
            hasOlderMessages: false,
          });
          return;
        }

        await updateMessageBundleState({
          reason: 'load_older',
          loadId,
          startedAt,
          messageList: loadResult.messageList,
          reactionList: loadResult.reactionList,
          attachmentList: loadResult.attachmentList,
          linkPreviewList: loadResult.linkPreviewList,
          hasOlder: loadResult.hasOlder,
        });

        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        logReload('load-older:complete', {
          loadId,
          addedCount: loadResult.prependCount,
          durationMs: Date.now() - startedAt,
          hasOlderMessages: loadResult.hasOlder,
        });
      } catch (error) {
        if (loadId == null) {
          if (isMounted) {
            console.error('Error loading older messages:', error);
          }
          return;
        }
        if (!isMounted || !isCurrentMessageLoad(loadId)) return;
        console.error('Error loading older messages:', error);
        logReload('load-older:error', {
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        finishOlderMessagesLoad({ updateUi: isMounted });
      }
    };

    setRequestOlderMessagesLoader(loadOlderMessages);

    const flushScheduledMessageReload = () => {
      if (!isMounted) return;
      if (activeLoadPromise) return;
      if (pendingReloadReasons.size === 0) return;

      const reasons = Array.from(pendingReloadReasons);
      pendingReloadReasons.clear();
      const reasonLabel = reasons.join('+');

      activeLoadPromise = loadMessages(reasonLabel).finally(() => {
        activeLoadPromise = null;
        if (!isMounted) return;
        if (pendingReloadReasons.size > 0 && scheduledReloadTimerId === null) {
          scheduledReloadTimerId = window.setTimeout(() => {
            scheduledReloadTimerId = null;
            flushScheduledMessageReload();
          }, 40);
        }
      });
    };

    const scheduleMessageReload = (reason: string, delayMs = 60) => {
      if (!isMounted) return;
      pendingReloadReasons.add(reason);
      logReload('load:queued', { reason, delayMs, pendingReasons: Array.from(pendingReloadReasons) });

      if (scheduledReloadTimerId !== null) return;
      if (delayMs <= 0 && !activeLoadPromise) {
        flushScheduledMessageReload();
        return;
      }

      scheduledReloadTimerId = window.setTimeout(() => {
        scheduledReloadTimerId = null;
        flushScheduledMessageReload();
      }, Math.max(0, delayMs));
    };

    const runMessageMediaMaintenance = async () => {
      try {
        const result = await runMessageMediaMaintenanceFromHook(100);
        if (!isMounted) return;
        if ((result.deletedMessages ?? 0) > 0) {
          logReload('maintenance:deleted', {
            deletedMessages: result.deletedMessages ?? 0,
            deletedObjects: result.deletedObjects ?? 0,
          });
          scheduleMessageReload('maintenance_reload', 20);
        }
      } catch (error) {
        if (!isMounted) return;
        console.warn('Failed to run media maintenance:', error);
      }
    };

    const handleVisibilityChange = () => {
      const visibility = document.visibilityState;
      logReload('visibility', { state: visibility });
      if (visibility === 'visible') {
        scheduleMessageReload('visibility_resume', 120);
      }
    };

    const handleWindowFocus = () => {
      logReload('window_focus');
      scheduleMessageReload('window_focus', 120);
    };

    const handleWindowBlur = () => {
      logReload('window_blur');
    };

    void hydrateChannelBundleFromCache();
    void runMessageMediaMaintenance();
    scheduleMessageReload('initial', 0);

    const messageChannel = communityBackend.subscribeToMessages(currentChannelId, (payload) => {
      const handled = applyIncrementalMessageChange(payload);
      if (!handled) {
        scheduleMessageReload('messages_sub_fallback');
      }
    });
    const reactionsChannel = communityBackend.subscribeToMessageReactions(currentChannelId, (payload) => {
      const handled = applyIncrementalReactionChange(payload);
      if (!handled) {
        scheduleMessageReload('reactions_sub_fallback');
      }
    });
    const attachmentsChannel = communityBackend.subscribeToMessageAttachments(currentChannelId, (payload) => {
      const messageId = getAffectedMessageIdFromRealtimePayload(
        payload,
        currentAttachmentList.map((row) => ({ id: row.id, messageId: row.messageId }))
      );
      if (!messageId) {
        scheduleMessageReload('attachments_sub_fallback');
        return;
      }
      queueAttachmentRefresh(messageId);
    });
    const linkPreviewsChannel = communityBackend.subscribeToMessageLinkPreviews(currentChannelId, (payload) => {
      const messageId = getAffectedMessageIdFromRealtimePayload(
        payload,
        currentLinkPreviewList.map((row) => ({ id: row.id, messageId: row.messageId }))
      );
      if (!messageId) {
        scheduleMessageReload('previews_sub_fallback');
        return;
      }
      queueLinkPreviewRefresh(messageId);
    });
    const cleanupIntervalId = window.setInterval(() => {
      void runMessageMediaMaintenance();
    }, 60 * 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      isMounted = false;
      clearRequestOlderMessagesLoader();
      pendingReloadReasons.clear();
      if (scheduledReloadTimerId !== null) {
        window.clearTimeout(scheduledReloadTimerId);
      }
      if (pendingAttachmentRefreshTimerId !== null) {
        window.clearTimeout(pendingAttachmentRefreshTimerId);
      }
      if (pendingLinkPreviewRefreshTimerId !== null) {
        window.clearTimeout(pendingLinkPreviewRefreshTimerId);
      }
      pendingAttachmentRefreshMessageIds.clear();
      pendingLinkPreviewRefreshMessageIds.clear();
      void messageChannel.unsubscribe();
      void reactionsChannel.unsubscribe();
      void attachmentsChannel.unsubscribe();
      void linkPreviewsChannel.unsubscribe();
      window.clearInterval(cleanupIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    user?.id,
    currentServerId,
    currentChannelId,
    currentChannelKind,
    debugChannelReloads,
    getCachedChannelBundle,
    cacheChannelBundle,
    fetchMessageAttachmentsForMessageIds,
    fetchMessageLinkPreviewsForMessageIds,
    runMessageMediaMaintenanceFromHook,
    getMessageLoadRuntime,
    isCurrentMessageLoad,
    syncOldestLoadedCursor,
    syncLoadedMessageWindow,
    loadLatestMessagesWithRelated,
    loadOlderMessagesWithRelated,
    finishOlderMessagesLoad,
    setRequestOlderMessagesLoader,
    clearRequestOlderMessagesLoader,
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

  // Resolve whether current user can speak in the selected voice channel.
  useEffect(() => {
    let isMounted = true;
    const voicePermissionChannelId = activeVoiceChannelId ?? currentChannelId;

    if (!user || !currentServerId || !voicePermissionChannelId) {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === voicePermissionChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'voice') {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const resolveVoiceSpeakPermission = async () => {
      try {
        const canSpeak = await communityBackend.canSendInChannel(voicePermissionChannelId);
        if (!isMounted) return;
        setCanSpeakInVoiceChannel(canSpeak);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error resolving voice speak permission:', error);
        setCanSpeakInVoiceChannel(false);
      }
    };

    void resolveVoiceSpeakPermission();

    return () => {
      isMounted = false;
    };
  }, [user, currentServerId, currentChannelId, activeVoiceChannelId, channels]);

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

  function openDirectMessagesWorkspace() {
    if (!dmWorkspaceEnabled) {
      const message = 'Direct messages are not enabled for your account.';
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-workspace-disabled' });
      return;
    }

    setWorkspaceMode('dm');
    setNotificationsPanelOpen(false);
    setFriendsPanelOpen(false);
    setFriendsPanelRequestedTab(null);
    setFriendsPanelHighlightedRequestId(null);
    setDmConversationsError(null);

    if (!selectedDmConversationId && dmConversations.length > 0) {
      setSelectedDmConversationId(dmConversations[0].conversationId);
    }

    void refreshDmConversations({ suppressLoadingState: true }).catch((error) => {
      const message = getErrorMessage(error, 'Failed to load direct messages.');
      console.error('Failed to open direct messages workspace:', error);
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-workspace-open-error' });
    });
  }

  async function openDirectMessageWithUser(targetUserId: string) {
    if (!user) {
      throw new Error('Not authenticated.');
    }
    if (!dmWorkspaceEnabled) {
      throw new Error('Direct messages are not enabled for your account.');
    }

    const conversationId = await directMessageBackend.getOrCreateDirectConversation(targetUserId);
    await openDirectMessageConversation(conversationId);
  }

  async function openDirectMessageConversation(conversationId: string) {
    if (!user) {
      throw new Error('Not authenticated.');
    }
    if (!dmWorkspaceEnabled) {
      throw new Error('Direct messages are not enabled for your account.');
    }
    if (!conversationId) {
      throw new Error('DM conversation id is required.');
    }

    setWorkspaceMode('dm');
    setSelectedDmConversationId(conversationId);
    await refreshDmConversations({ suppressLoadingState: true });
    await refreshDmMessages(conversationId, { suppressLoadingState: true, markRead: true });
  }

  function directMessageUser(targetUserId: string) {
    setDmConversationsError(null);

    if (!dmWorkspaceEnabled) {
      const message = 'Direct messages are coming soon.';
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-open-disabled' });
      return;
    }

    if (!targetUserId) {
      const message = 'Invalid DM target.';
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-open-invalid-target' });
      return;
    }

    if (user?.id && targetUserId === user.id) {
      const message = 'You cannot direct message yourself.';
      setDmConversationsError(message);
      toast.error(message, { id: 'dm-open-self' });
      return;
    }

    void openDirectMessageWithUser(targetUserId).catch((error) => {
      const message = getErrorMessage(error, 'Failed to open direct message.');
      const errorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
          ? ((error as { code: string }).code ?? null)
          : null;

      console.error('Failed to open direct message:', error);
      setDmConversationsError(message);

      if (errorCode === 'P0001' && message.includes('friends list')) {
        toast.error(message, {
          id: 'dm-open-friends-only',
          action: friendsSocialPanelEnabled
            ? {
                label: 'Open Friends',
                onClick: () => {
                  setFriendsPanelRequestedTab('add');
                  setFriendsPanelHighlightedRequestId(null);
                  setFriendsPanelOpen(true);
                },
              }
            : undefined,
        });
        return;
      }

      toast.error(message, { id: 'dm-open-error' });
    });
  }

  async function sendDirectMessage(content: string) {
    if (!selectedDmConversationId) {
      throw new Error('No direct message conversation selected.');
    }

    setDmMessageSendPending(true);
    setDmMessagesError(null);
    try {
      await directMessageBackend.sendMessage({
        conversationId: selectedDmConversationId,
        content,
      });
      await Promise.all([
        refreshDmMessages(selectedDmConversationId, { suppressLoadingState: true, markRead: false }),
        refreshDmConversations({ suppressLoadingState: true }),
      ]);
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to send direct message.');
      console.error('Failed to send direct message:', error);
      setDmMessagesError(message);
      throw new Error(message);
    } finally {
      setDmMessageSendPending(false);
    }
  }

  async function toggleSelectedDmConversationMuted(nextMuted: boolean) {
    if (!selectedDmConversationId) {
      throw new Error('No direct message conversation selected.');
    }

    await directMessageBackend.setConversationMuted({
      conversationId: selectedDmConversationId,
      muted: nextMuted,
    });
    await refreshDmConversations({ suppressLoadingState: true });
  }

  async function reportDirectMessage(input: {
    messageId: string;
    kind: DirectMessageReportKind;
    comment: string;
  }) {
    await directMessageBackend.reportMessage(input);
  }

  async function blockDirectMessageUser(input: { userId: string; username: string }) {
    await socialBackend.blockUser(input.userId);
    setDmMessages([]);
    setSelectedDmConversationId(null);

    await Promise.all([
      refreshSocialCounts(),
      refreshDmConversations({ suppressLoadingState: true }),
      refreshNotificationInbox({ playSoundsForNew: false }),
    ]);
  }

  function requestVoiceChannelJoin(channelId: string) {
    const targetChannel = channels.find(
      (channel) => channel.id === channelId && channel.kind === 'voice'
    );
    if (!targetChannel) return;

    if (!activeVoiceChannelId) {
      setVoiceJoinPrompt({
        channelId,
        mode: 'join',
      });
      return;
    }

    if (activeVoiceChannelId === channelId) {
      return;
    }

    setVoiceJoinPrompt({
      channelId,
      mode: 'switch',
    });
  }

  function confirmVoiceChannelJoin() {
    if (!voiceJoinPrompt) return;
    setActiveVoiceChannelId(voiceJoinPrompt.channelId);
    setVoicePanelOpen(false);
    setVoiceJoinPrompt(null);
  }

  function cancelVoiceChannelJoinPrompt() {
    setVoiceJoinPrompt(null);
  }

  function disconnectVoiceSession(options?: { triggerPaneLeave?: boolean }) {
    if (options?.triggerPaneLeave !== false) {
      voiceControlActions?.leave();
    }
    setActiveVoiceChannelId(null);
    setVoicePanelOpen(false);
    setVoiceConnected(false);
    setVoiceParticipants([]);
    setVoiceControlActions(null);
    setVoiceSessionState({
      joined: false,
      joining: false,
      isMuted: false,
      isDeafened: false,
      listenOnly: true,
    });
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

  async function saveNotificationPreferences(values: NotificationPreferenceUpdate) {
    setNotificationPreferencesSaving(true);
    setNotificationPreferencesError(null);
    try {
      const nextPreferences = await notificationBackend.updateNotificationPreferences(values);
      setNotificationPreferences(nextPreferences);
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationPreferencesError(
        getErrorMessage(error, 'Failed to update notification preferences.')
      );
    } finally {
      setNotificationPreferencesSaving(false);
    }
  }

  async function refreshNotificationsManually() {
    setNotificationsRefreshing(true);
    setNotificationsError(null);
    try {
      await refreshNotificationInbox({ playSoundsForNew: false });
      await refreshNotificationPreferences();
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to refresh notifications.'));
    } finally {
      setNotificationsRefreshing(false);
    }
  }

  async function markAllNotificationsSeen() {
    try {
      await notificationBackend.markAllNotificationsSeen();
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to mark notifications seen.'));
    }
  }

  async function markNotificationRead(recipientId: string) {
    try {
      await notificationBackend.markNotificationsRead([recipientId]);
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to mark notification read.'));
    }
  }

  async function dismissNotification(recipientId: string) {
    try {
      await notificationBackend.dismissNotifications([recipientId]);
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to dismiss notification.'));
    }
  }

  async function openNotificationItem(notification: NotificationItem) {
    try {
      switch (notification.kind) {
        case 'dm_message': {
          const conversationId = getNotificationPayloadString(notification, 'conversationId');
          if (!conversationId) {
            throw new Error('This notification does not include a DM conversation target.');
          }
          await openDirectMessageConversation(conversationId);
          setNotificationsPanelOpen(false);
          break;
        }
        case 'friend_request_received': {
          if (!friendsSocialPanelEnabled) {
            throw new Error('Friends are not enabled for your account.');
          }
          setFriendsPanelRequestedTab('requests');
          setFriendsPanelHighlightedRequestId(
            getNotificationPayloadString(notification, 'friendRequestId')
          );
          setFriendsPanelOpen(true);
          setNotificationsPanelOpen(false);
          break;
        }
        case 'friend_request_accepted': {
          if (!friendsSocialPanelEnabled) {
            throw new Error('Friends are not enabled for your account.');
          }
          setFriendsPanelRequestedTab('friends');
          setFriendsPanelHighlightedRequestId(null);
          setFriendsPanelOpen(true);
          setNotificationsPanelOpen(false);
          break;
        }
        case 'channel_mention': {
          const communityId = getNotificationPayloadString(notification, 'communityId');
          const channelId = getNotificationPayloadString(notification, 'channelId');
          if (!communityId || !channelId) {
            throw new Error('This mention notification does not include a channel target.');
          }
          setWorkspaceMode('community');
          setCurrentServerId(communityId);
          setCurrentChannelId(channelId);
          setNotificationsPanelOpen(false);
          break;
        }
        default: {
          // Future notification kinds can add deep-link routes here.
          break;
        }
      }

      await notificationBackend.markNotificationsRead([notification.recipientId]);
      await refreshNotificationInbox({ playSoundsForNew: false });
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to open notification.'));
    }
  }

  async function acceptFriendRequestFromNotification(input: {
    recipientId: string;
    friendRequestId: string;
  }) {
    try {
      await socialBackend.acceptFriendRequest(input.friendRequestId);
      await notificationBackend.markNotificationsRead([input.recipientId]);
      await Promise.all([
        refreshNotificationInbox({ playSoundsForNew: false }),
        refreshSocialCounts(),
      ]);
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to accept friend request.'));
    }
  }

  async function declineFriendRequestFromNotification(input: {
    recipientId: string;
    friendRequestId: string;
  }) {
    try {
      await socialBackend.declineFriendRequest(input.friendRequestId);
      await notificationBackend.markNotificationsRead([input.recipientId]);
      await Promise.all([
        refreshNotificationInbox({ playSoundsForNew: false }),
        refreshSocialCounts(),
      ]);
    } catch (error) {
      setNotificationsError(getErrorMessage(error, 'Failed to decline friend request.'));
    }
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
  const activeVoiceChannel = channels.find(
    (channel) => channel.id === activeVoiceChannelId && channel.kind === 'voice'
  );
  const baseUserDisplayName = profileUsername || user.email?.split('@')[0] || 'User';
  const userDisplayName = isPlatformStaff
    ? `${platformStaffPrefix ?? 'Haven'}-${baseUserDisplayName}`
    : baseUserDisplayName;
  const activeVoiceParticipantsForSidebar: VoiceSidebarParticipant[] = activeVoiceChannelId
    ? [
        ...(voiceSessionState.joined
          ? [
              {
                userId: user.id,
                displayName: userDisplayName,
              },
            ]
          : []),
        ...voiceParticipants,
      ].filter(
        (participant, participantIndex, participantList) =>
          participantList.findIndex((candidate) => candidate.userId === participant.userId) ===
          participantIndex
      )
    : [];
  const voiceChannelParticipants = {
    ...voicePresenceByChannelId,
    ...(activeVoiceChannelId
      ? {
          [activeVoiceChannelId]: activeVoiceParticipantsForSidebar,
        }
      : {}),
  };
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
                          {voiceParticipants.length + (voiceConnected ? 1 : 0)} in call
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

