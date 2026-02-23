import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoginScreen } from '@/components/LoginScreen';
import { ServerList } from '@/components/ServerList';
import { CreateServerModal } from '@/components/CreateServerModal';
import { CreateChannelModal } from '@/components/CreateChannelModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
import { QuickRenameDialog } from '@/components/QuickRenameDialog';
import { ServerMembersModal } from '@/components/ServerMembersModal';
import {
  ServerInviteItem,
  ServerSettingsModal,
  ServerSettingsValues,
} from '@/components/ServerSettingsModal';
import {
  ChannelMemberOption,
  ChannelMemberPermissionItem,
  ChannelPermissionState,
  ChannelRolePermissionItem,
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
import { TooltipProvider } from '@/components/ui/tooltip';
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
import type { AppSettings, NotificationAudioSettings, UpdaterStatus } from '@/shared/desktop/types';
import type {
  AuthorProfile,
  BanEligibleServer,
  Channel,
  ChannelGroupState,
  ChannelKind,
  CommunityBanItem,
  CommunityMemberListItem,
  DirectMessage,
  DirectMessageConversationSummary,
  DirectMessageReportKind,
  DeveloperAccessMode,
  FeatureFlagsSnapshot,
  MessageAttachment,
  MessageLinkPreview,
  NotificationCounts,
  NotificationItem,
  NotificationPreferences,
  NotificationPreferenceUpdate,
  PermissionCatalogItem,
  MessageReaction,
  MessageReportKind,
  MessageReportTarget,
  Message,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
  SocialCounts,
} from '@/lib/backend/types';
import { Headphones, Mic, MicOff, PhoneOff, Settings2, VolumeX } from 'lucide-react';
import '@/styles/globals.css';

type VoiceSidebarParticipant = {
  userId: string;
  displayName: string;
};

type VoicePresenceStateRow = {
  user_id?: string | null;
  display_name?: string | null;
  joined_at?: string | null;
};

type ChannelMessageBundleCacheEntry = {
  messages: Message[];
  reactions: MessageReaction[];
  attachments: MessageAttachment[];
  linkPreviews: MessageLinkPreview[];
  hasOlderMessages: boolean;
};

type FriendsPanelTab = 'friends' | 'add' | 'requests' | 'blocked';

const areVoiceParticipantListsEqual = (
  left: VoiceSidebarParticipant[],
  right: VoiceSidebarParticipant[]
) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].userId !== right[index].userId ||
      left[index].displayName !== right[index].displayName
    ) {
      return false;
    }
  }

  return true;
};

const ENABLE_CHANNEL_RELOAD_DIAGNOSTICS =
  typeof process !== 'undefined' && process.env.HAVEN_DEBUG_CHANNEL_RELOADS === '1';
const MESSAGE_PAGE_SIZE = 75;
const FRIENDS_SOCIAL_PANEL_FLAG = 'friends_dms_v1';
const DM_REPORT_REVIEW_PANEL_FLAG = 'dm_report_review_v1';
const VOICE_HARDWARE_DEBUG_PANEL_FLAG = 'debug_voice_hardware_panel';
const VOICE_HARDWARE_DEBUG_PANEL_HOTKEY_LABEL = 'Ctrl/Cmd + Alt + Shift + V';
const DEFAULT_NOTIFICATION_AUDIO_SETTINGS: NotificationAudioSettings = {
  masterSoundEnabled: true,
  notificationSoundVolume: 70,
  playSoundsWhenFocused: true,
};
const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 2,
  autoUpdateEnabled: true,
  notifications: { ...DEFAULT_NOTIFICATION_AUDIO_SETTINGS },
};
const DEFAULT_NOTIFICATION_COUNTS: NotificationCounts = {
  unseenCount: 0,
  unreadCount: 0,
};
const DEFAULT_SOCIAL_COUNTS: SocialCounts = {
  friendsCount: 0,
  incomingPendingRequestCount: 0,
  outgoingPendingRequestCount: 0,
  blockedUserCount: 0,
};

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const getNotificationPayloadString = (
  notification: NotificationItem,
  key: string
): string | null => {
  const value = notification.payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

function ChatApp() {
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
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [showChannelSettingsModal, setShowChannelSettingsModal] = useState(false);
  const [channelSettingsTargetId, setChannelSettingsTargetId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [profileUsername, setProfileUsername] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachment[]>([]);
  const [messageLinkPreviews, setMessageLinkPreviews] = useState<MessageLinkPreview[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagsSnapshot>({});
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [platformStaffPrefix, setPlatformStaffPrefix] = useState<string | null>(null);
  const [canPostHavenDevMessage, setCanPostHavenDevMessage] = useState(false);
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
  const [serverPermissions, setServerPermissions] = useState<ServerPermissions>({
    isOwner: false,
    canManageServer: false,
    canManageRoles: false,
    canManageMembers: false,
    canCreateChannels: false,
    canManageChannels: false,
    canManageMessages: false,
    canManageBans: false,
    canCreateReports: false,
    canRefreshLinkPreviews: false,
    canManageDeveloperAccess: false,
    canManageInvites: false,
  });
  const [serverSettingsInitialValues, setServerSettingsInitialValues] =
    useState<ServerSettingsValues | null>(null);
  const [serverSettingsLoading, setServerSettingsLoading] = useState(false);
  const [serverSettingsLoadError, setServerSettingsLoadError] = useState<string | null>(null);
  const [serverInvites, setServerInvites] = useState<ServerInviteItem[]>([]);
  const [serverInvitesLoading, setServerInvitesLoading] = useState(false);
  const [serverInvitesError, setServerInvitesError] = useState<string | null>(null);
  const [serverRoles, setServerRoles] = useState<ServerRoleItem[]>([]);
  const [serverMembers, setServerMembers] = useState<ServerMemberRoleItem[]>([]);
  const [serverPermissionCatalog, setServerPermissionCatalog] = useState<PermissionCatalogItem[]>(
    []
  );
  const [serverRoleManagementLoading, setServerRoleManagementLoading] = useState(false);
  const [serverRoleManagementError, setServerRoleManagementError] = useState<string | null>(null);
  const [channelRolePermissions, setChannelRolePermissions] = useState<ChannelRolePermissionItem[]>(
    []
  );
  const [channelMemberPermissions, setChannelMemberPermissions] = useState<
    ChannelMemberPermissionItem[]
  >([]);
  const [channelPermissionMemberOptions, setChannelPermissionMemberOptions] = useState<
    ChannelMemberOption[]
  >([]);
  const [channelPermissionsLoading, setChannelPermissionsLoading] = useState(false);
  const [channelPermissionsLoadError, setChannelPermissionsLoadError] = useState<string | null>(
    null
  );
  const [channelGroupState, setChannelGroupState] = useState<ChannelGroupState>({
    groups: [],
    ungroupedChannelIds: [],
    collapsedGroupIds: [],
  });
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [membersModalCommunityId, setMembersModalCommunityId] = useState<string | null>(null);
  const [membersModalServerName, setMembersModalServerName] = useState('');
  const [membersModalMembers, setMembersModalMembers] = useState<CommunityMemberListItem[]>([]);
  const [membersModalLoading, setMembersModalLoading] = useState(false);
  const [membersModalError, setMembersModalError] = useState<string | null>(null);
  const [membersModalCanCreateReports, setMembersModalCanCreateReports] = useState(false);
  const [membersModalCanManageBans, setMembersModalCanManageBans] = useState(false);
  const [renameServerDraft, setRenameServerDraft] = useState<{ serverId: string; currentName: string } | null>(
    null
  );
  const [renameChannelDraft, setRenameChannelDraft] = useState<{ channelId: string; currentName: string } | null>(
    null
  );
  const [renameGroupDraft, setRenameGroupDraft] = useState<{ groupId: string; currentName: string } | null>(null);
  const [createGroupDraft, setCreateGroupDraft] = useState<{ channelId: string | null } | null>(null);
  const [communityBans, setCommunityBans] = useState<CommunityBanItem[]>([]);
  const [communityBansLoading, setCommunityBansLoading] = useState(false);
  const [communityBansError, setCommunityBansError] = useState<string | null>(null);
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
  const [notificationAudioSettingsSaving, setNotificationAudioSettingsSaving] = useState(false);
  const [notificationAudioSettingsError, setNotificationAudioSettingsError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    ...DEFAULT_APP_SETTINGS,
    notifications: { ...DEFAULT_NOTIFICATION_AUDIO_SETTINGS },
  });
  const [appSettingsLoading, setAppSettingsLoading] = useState(true);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [updaterStatusLoading, setUpdaterStatusLoading] = useState(true);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const authorProfileCacheRef = useRef<Record<string, AuthorProfile>>({});
  const requestOlderMessagesRef = useRef<(() => Promise<void>) | null>(null);
  const channelsByServerCacheRef = useRef<Record<string, Channel[]>>({});
  const lastSelectedChannelIdByServerRef = useRef<Record<string, string | null>>({});
  const messageBundleByChannelCacheRef = useRef<Record<string, ChannelMessageBundleCacheEntry>>({});
  const knownNotificationRecipientIdsRef = useRef<Set<string>>(new Set());
  const notificationsBootstrappedRef = useRef(false);
  const notificationAudioSettingsRef = useRef<NotificationAudioSettings>(
    DEFAULT_NOTIFICATION_AUDIO_SETTINGS
  );
  const hasFeatureFlag = (flagKey: string) => Boolean(featureFlags[flagKey]);
  const debugChannelReloads =
    ENABLE_CHANNEL_RELOAD_DIAGNOSTICS || hasFeatureFlag('debug_channel_reload_diagnostics');
  const friendsSocialPanelEnabled = hasFeatureFlag(FRIENDS_SOCIAL_PANEL_FLAG);
  const dmWorkspaceEnabled = friendsSocialPanelEnabled;
  const dmWorkspaceIsActive = dmWorkspaceEnabled && workspaceMode === 'dm';
  const dmReportReviewPanelEnabled = isPlatformStaff && hasFeatureFlag(DM_REPORT_REVIEW_PANEL_FLAG);
  const voiceHardwareDebugPanelEnabled = hasFeatureFlag(VOICE_HARDWARE_DEBUG_PANEL_FLAG);
  const currentChannelKind: ChannelKind | null =
    currentChannelId ? (channels.find((channel) => channel.id === currentChannelId)?.kind ?? null) : null;
  const getChannelBundleCacheKey = (communityId: string, channelId: string) => `${communityId}:${channelId}`;

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
    let isMounted = true;

    if (!user) {
      setProfileUsername('');
      setProfileAvatarUrl(null);
      setIsPlatformStaff(false);
      setPlatformStaffPrefix(null);
      setCanPostHavenDevMessage(false);
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
      setMessages([]);
      setMessageReactions([]);
      setMessageAttachments([]);
      setMessageLinkPreviews([]);
      setHasOlderMessages(false);
      setIsLoadingOlderMessages(false);
      setAuthorProfiles({});
      authorProfileCacheRef.current = {};
      requestOlderMessagesRef.current = null;
      knownNotificationRecipientIdsRef.current = new Set();
      notificationsBootstrappedRef.current = false;
      setFeatureFlags({});
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
      setNotificationAudioSettingsSaving(false);
      setNotificationAudioSettingsError(null);
      setServerPermissions({
        isOwner: false,
        canManageServer: false,
        canManageRoles: false,
        canManageMembers: false,
        canCreateChannels: false,
        canManageChannels: false,
        canManageMessages: false,
        canManageBans: false,
        canCreateReports: false,
        canRefreshLinkPreviews: false,
        canManageDeveloperAccess: false,
        canManageInvites: false,
      });
      setServerSettingsInitialValues(null);
      setShowCreateChannelModal(false);
      setShowJoinServerModal(false);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
      setShowAccountModal(false);
      setServerSettingsLoadError(null);
      setServerInvites([]);
      setServerInvitesLoading(false);
      setServerInvitesError(null);
      setServerRoles([]);
      setServerMembers([]);
      setServerPermissionCatalog([]);
      setServerRoleManagementLoading(false);
      setServerRoleManagementError(null);
      setChannelRolePermissions([]);
      setChannelMemberPermissions([]);
      setChannelPermissionMemberOptions([]);
      setChannelPermissionsLoadError(null);
      setChannelPermissionsLoading(false);
      setChannelGroupState({
        groups: [],
        ungroupedChannelIds: [],
        collapsedGroupIds: [],
      });
      setShowMembersModal(false);
      setMembersModalCommunityId(null);
      setMembersModalServerName('');
      setMembersModalMembers([]);
      setMembersModalLoading(false);
      setMembersModalError(null);
      setMembersModalCanCreateReports(false);
      setMembersModalCanManageBans(false);
      setRenameServerDraft(null);
      setRenameChannelDraft(null);
      setRenameGroupDraft(null);
      setCreateGroupDraft(null);
      setCommunityBans([]);
      setCommunityBansLoading(false);
      setCommunityBansError(null);
      return;
    }

    const fallbackUsername = user.email?.split('@')[0] || 'User';

    const loadProfile = async () => {
      const [profileResult, staffResult] = await Promise.allSettled([
        controlPlaneBackend.fetchUserProfile(user.id),
        controlPlaneBackend.fetchPlatformStaff(user.id),
      ]);

      if (!isMounted) return;

      if (profileResult.status === 'rejected') {
        console.error('Error loading profile:', profileResult.reason);
        setProfileUsername(fallbackUsername);
        setProfileAvatarUrl(null);
      } else {
        const profile = profileResult.value;
        setProfileUsername(profile?.username ?? fallbackUsername);
        setProfileAvatarUrl(profile?.avatarUrl ?? null);
      }

      if (staffResult.status === 'rejected') {
        console.error('Error loading platform staff info:', staffResult.reason);
        setIsPlatformStaff(false);
        setPlatformStaffPrefix(null);
        setCanPostHavenDevMessage(false);
      } else {
        const staff = staffResult.value;
        const activeStaff = Boolean(staff?.isActive);
        setIsPlatformStaff(activeStaff);
        setPlatformStaffPrefix(staff?.displayPrefix ?? null);
        setCanPostHavenDevMessage(Boolean(staff?.isActive && staff?.canPostHavenDev));
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      setFeatureFlags({});
      return;
    }

    const loadFeatureFlags = async () => {
      try {
        const flags = await controlPlaneBackend.listMyFeatureFlags();
        if (!isMounted) return;
        setFeatureFlags(flags);
      } catch (error) {
        if (!isMounted) return;
        console.warn('Failed to load feature flags:', error);
        setFeatureFlags({});
      }
    };

    void loadFeatureFlags();

    return () => {
      isMounted = false;
    };
  }, [controlPlaneBackend, user?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadDesktopSettings = async () => {
      if (!desktopClient.isAvailable()) {
        if (!isMounted) return;
        setAppSettingsLoading(false);
        setUpdaterStatusLoading(false);
        setUpdaterStatus({
          supported: false,
          isPackaged: false,
          platform: 'unknown',
          enabled: false,
          initialized: false,
          status: 'unsupported_platform',
          lastCheckedAt: null,
          lastError: 'Desktop bridge unavailable.',
          disableNeedsRestart: false,
          repository: 'redrix-dev/haven',
        });
        return;
      }

      const [settingsResult, updaterResult] = await Promise.allSettled([
        desktopClient.getAppSettings(),
        desktopClient.getUpdaterStatus(),
      ]);

      if (!isMounted) return;

      if (settingsResult.status === 'fulfilled') {
        setAppSettings(settingsResult.value);
      }
      setAppSettingsLoading(false);

      if (updaterResult.status === 'fulfilled') {
        setUpdaterStatus(updaterResult.value);
      } else {
        setUpdaterStatus({
          supported: false,
          isPackaged: false,
          platform: 'unknown',
          enabled: false,
          initialized: false,
          status: 'error',
          lastCheckedAt: null,
          lastError: updaterResult.reason instanceof Error
            ? updaterResult.reason.message
            : String(updaterResult.reason),
          disableNeedsRestart: false,
          repository: 'redrix-dev/haven',
        });
      }

      setUpdaterStatusLoading(false);
    };

    void loadDesktopSettings();

    return () => {
      isMounted = false;
    };
  }, []);

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
          await directMessageBackend.markConversationRead(conversationId);
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
      if (dmWorkspaceIsActive && selectedDmConversationId) {
        void refreshDmMessages(selectedDmConversationId, {
          suppressLoadingState: true,
          markRead: true,
        }).catch((error) => {
          console.error('Failed to refresh selected DM after realtime update:', error);
        });
      }
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
        markRead: true,
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

  // Auto-select first server
  useEffect(() => {
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [servers, currentServerId]);

  useEffect(() => {
    if (!currentServerId) return;
    if (!currentChannelId) return;
    lastSelectedChannelIdByServerRef.current[currentServerId] = currentChannelId;
  }, [currentServerId, currentChannelId]);

  // Resolve server-scoped permissions for the current user.
  useEffect(() => {
    let isMounted = true;

    if (!user || !currentServerId) {
      setServerPermissions({
        isOwner: false,
        canManageServer: false,
        canManageRoles: false,
        canManageMembers: false,
        canCreateChannels: false,
        canManageChannels: false,
        canManageMessages: false,
        canManageBans: false,
        canCreateReports: false,
        canRefreshLinkPreviews: false,
        canManageDeveloperAccess: false,
        canManageInvites: false,
      });
      return;
    }

    const loadPermissions = async () => {
      try {
        const communityBackend = getCommunityDataBackend(currentServerId);
        const permissions = await communityBackend.fetchServerPermissions(currentServerId);

        if (!isMounted) return;
        setServerPermissions(permissions);
      } catch (error) {
        console.error('Error loading server permissions:', error);
        if (!isMounted) return;
        setServerPermissions({
          isOwner: false,
          canManageServer: false,
          canManageRoles: false,
          canManageMembers: false,
          canCreateChannels: false,
          canManageChannels: false,
          canManageMessages: false,
          canManageBans: false,
          canCreateReports: false,
          canRefreshLinkPreviews: false,
          canManageDeveloperAccess: false,
          canManageInvites: false,
        });
      }
    };

    void loadPermissions();

    return () => {
      isMounted = false;
    };
  }, [user, currentServerId]);

  // Load channels when server changes
  useEffect(() => {
    let isMounted = true;

    if (!currentServerId) {
      setChannels([]);
      setChannelsLoading(false);
      setChannelsError(null);
      setCurrentChannelId(null);
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
      setServerSettingsInitialValues(null);
      setServerSettingsLoadError(null);
      setServerInvites([]);
      setServerInvitesLoading(false);
      setServerInvitesError(null);
      setServerRoles([]);
      setServerMembers([]);
      setServerPermissionCatalog([]);
      setServerRoleManagementLoading(false);
      setServerRoleManagementError(null);
      setChannelRolePermissions([]);
      setChannelMemberPermissions([]);
      setChannelPermissionMemberOptions([]);
      setChannelPermissionsLoadError(null);
      setChannelPermissionsLoading(false);
      setChannelGroupState({
        groups: [],
        ungroupedChannelIds: [],
        collapsedGroupIds: [],
      });
      setShowMembersModal(false);
      setMembersModalCommunityId(null);
      setMembersModalServerName('');
      setMembersModalMembers([]);
      setMembersModalLoading(false);
      setMembersModalError(null);
      setMembersModalCanCreateReports(false);
      setMembersModalCanManageBans(false);
      setRenameChannelDraft(null);
      setRenameGroupDraft(null);
      setCreateGroupDraft(null);
      setCommunityBans([]);
      setCommunityBansLoading(false);
      setCommunityBansError(null);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    const hasCachedChannels = Object.prototype.hasOwnProperty.call(
      channelsByServerCacheRef.current,
      currentServerId
    );
    const cachedChannels = hasCachedChannels ? channelsByServerCacheRef.current[currentServerId] ?? [] : null;

    const resolvePreferredChannelId = (channelList: Channel[], previousChannelId: string | null) => {
      if (channelList.length === 0) return null;

      const rememberedChannelId = lastSelectedChannelIdByServerRef.current[currentServerId] ?? null;
      const candidates = [rememberedChannelId, previousChannelId];
      for (const candidate of candidates) {
        if (candidate && channelList.some((channel) => channel.id === candidate)) {
          return candidate;
        }
      }

      const firstTextChannel = channelList.find((channel) => channel.kind === 'text');
      return firstTextChannel?.id ?? channelList[0].id;
    };

    if (cachedChannels) {
      setChannels(cachedChannels);
      setChannelsError(null);
      setChannelsLoading(false);
      setCurrentChannelId((prev) => resolvePreferredChannelId(cachedChannels, prev));
    }

    const loadChannels = async (options?: { blocking?: boolean }) => {
      if (options?.blocking === true) {
        setChannelsLoading(true);
      } else if (!hasCachedChannels) {
        setChannelsLoading(true);
      }
      setChannelsError(null);
      try {
        const channelList = await communityBackend.listChannels(currentServerId);

        if (!isMounted) return;

        channelsByServerCacheRef.current[currentServerId] = channelList;
        setChannels(channelList);
        setCurrentChannelId((prev) => {
          return resolvePreferredChannelId(channelList, prev);
        });
      } catch (error: unknown) {
        if (!isMounted) return;
        console.error('Error loading channels:', error);
        if (!hasCachedChannels) {
          setChannels([]);
          setCurrentChannelId(null);
        }
        setChannelsError(getErrorMessage(error, 'Failed to load channels.'));
      }

      setChannelsLoading(false);
    };

    void loadChannels({ blocking: !hasCachedChannels });

    const subscription = communityBackend.subscribeToChannels(currentServerId, () => {
      void loadChannels({ blocking: false });
    });

    return () => {
      isMounted = false;
      void subscription.unsubscribe();
    };
  }, [currentServerId]);

  useEffect(() => {
    let isMounted = true;

    if (!currentServerId) {
      setChannelGroupState({
        groups: [],
        ungroupedChannelIds: [],
        collapsedGroupIds: [],
      });
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    const channelIds = channels.map((channel) => channel.id);

    const loadChannelGroups = async () => {
      try {
        const state = await communityBackend.listChannelGroups({
          communityId: currentServerId,
          channelIds,
        });
        if (!isMounted) return;
        setChannelGroupState(state);
      } catch (error) {
        console.error('Failed to load channel groups:', error);
        if (!isMounted) return;
        setChannelGroupState({
          groups: [],
          ungroupedChannelIds: channelIds,
          collapsedGroupIds: [],
        });
      }
    };

    void loadChannelGroups();

    const groupSubscription = supabase
      .channel(`channel_groups:${currentServerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_groups',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_group_channels',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_group_preferences',
          filter: `community_id=eq.${currentServerId}`,
        },
        () => {
          void loadChannelGroups();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void groupSubscription.unsubscribe();
    };
  }, [channels, currentServerId]);

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
      setMessages([]);
      setMessageReactions([]);
      setMessageAttachments([]);
      setMessageLinkPreviews([]);
      setAuthorProfiles({});
      setHasOlderMessages(false);
      setIsLoadingOlderMessages(false);
      requestOlderMessagesRef.current = null;
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.community_id !== currentServerId) {
      return;
    }

    if (selectedChannel.kind !== 'text') {
      setMessages([]);
      setMessageReactions([]);
      setMessageAttachments([]);
      setMessageLinkPreviews([]);
      setAuthorProfiles({});
      setHasOlderMessages(false);
      setIsLoadingOlderMessages(false);
      requestOlderMessagesRef.current = null;
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    const channelBundleCacheKey = getChannelBundleCacheKey(currentServerId, currentChannelId);
    let latestLoadId = 0;
    let activeLoadPromise: Promise<void> | null = null;
    let scheduledReloadTimerId: number | null = null;
    const pendingReloadReasons = new Set<string>();
    let olderLoadInFlight = false;
    let currentMessageList: Message[] = [];
    let currentReactionList: MessageReaction[] = [];
    let currentAttachmentList: MessageAttachment[] = [];
    let currentLinkPreviewList: MessageLinkPreview[] = [];
    let currentHasOlderMessages = false;
    let oldestLoadedCursor: { createdAt: string; id: string } | null = null;
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
      messageBundleByChannelCacheRef.current[channelBundleCacheKey] = {
        messages: currentMessageList,
        reactions: currentReactionList,
        attachments: currentAttachmentList,
        linkPreviews: currentLinkPreviewList,
        hasOlderMessages: currentHasOlderMessages,
      };
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
      if (!isMounted || input.loadId !== latestLoadId) return;

      currentMessageList = input.messageList;
      currentReactionList = input.reactionList;
      currentAttachmentList = input.attachmentList;
      currentLinkPreviewList = input.linkPreviewList;
      currentHasOlderMessages = input.hasOlder;
      oldestLoadedCursor =
        input.messageList.length > 0
          ? {
              createdAt: input.messageList[0].created_at,
              id: input.messageList[0].id,
            }
          : null;

      setMessages(input.messageList);
      setMessageReactions(input.reactionList);
      setMessageAttachments(input.attachmentList);
      setMessageLinkPreviews(input.linkPreviewList);
      setHasOlderMessages(input.hasOlder);
      persistCurrentChannelBundleCache();

      const { authorCount, fetchedAuthorCount } = await updateAuthorProfilesForMessages(input.messageList);
      if (!isMounted || input.loadId !== latestLoadId) return;

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
      oldestLoadedCursor =
        nextMessages.length > 0 ? { createdAt: nextMessages[0].created_at, id: nextMessages[0].id } : null;
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
      const cachedBundle = messageBundleByChannelCacheRef.current[channelBundleCacheKey];
      if (!cachedBundle) return false;

      currentMessageList = cachedBundle.messages;
      currentReactionList = cachedBundle.reactions;
      currentAttachmentList = cachedBundle.attachments;
      currentLinkPreviewList = cachedBundle.linkPreviews;
      currentHasOlderMessages = cachedBundle.hasOlderMessages;
      oldestLoadedCursor =
        cachedBundle.messages.length > 0
          ? { createdAt: cachedBundle.messages[0].created_at, id: cachedBundle.messages[0].id }
          : null;

      if (!isMounted) return true;
      setMessages(cachedBundle.messages);
      setMessageReactions(cachedBundle.reactions);
      setMessageAttachments(cachedBundle.attachments);
      setMessageLinkPreviews(cachedBundle.linkPreviews);
      setHasOlderMessages(cachedBundle.hasOlderMessages);
      scheduleAuthorProfileSyncForCurrentMessages('channel_cache_hydrate');
      logReload('cache:hydrate', {
        messageCount: cachedBundle.messages.length,
        hasOlderMessages: cachedBundle.hasOlderMessages,
      });
      return true;
    };

    const fetchRelatedForMessages = async (messageList: Message[]) => {
      const messageIds = messageList.map((message) => message.id);
      if (messageIds.length === 0) {
        return {
          reactionList: [] as MessageReaction[],
          attachmentList: [] as MessageAttachment[],
          linkPreviewList: [] as MessageLinkPreview[],
        };
      }

      const [reactionList, attachmentList, linkPreviewList] = await Promise.all([
        communityBackend.listMessageReactionsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
        communityBackend.listMessageAttachmentsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
        communityBackend.listMessageLinkPreviewsForMessages({
          communityId: currentServerId,
          channelId: currentChannelId,
          messageIds,
        }),
      ]);

      return { reactionList, attachmentList, linkPreviewList };
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

      const refreshedRows = await communityBackend.listMessageAttachmentsForMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: uniqueMessageIds,
      });

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

      const refreshedRows = await communityBackend.listMessageLinkPreviewsForMessages({
        communityId: currentServerId,
        channelId: currentChannelId,
        messageIds: uniqueMessageIds,
      });

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

    const fetchLatestMessageWindow = async (targetCount: number) => {
      const boundedTargetCount = Math.max(Math.floor(targetCount), MESSAGE_PAGE_SIZE);
      let beforeCursor: { createdAt: string; id: string } | null = null;
      let aggregatedMessages: Message[] = [];
      let hasMore = false;

      while (aggregatedMessages.length < boundedTargetCount) {
        const remaining = boundedTargetCount - aggregatedMessages.length;
        const page = await communityBackend.listMessagesPage({
          communityId: currentServerId,
          channelId: currentChannelId,
          beforeCursor,
          limit: Math.min(MESSAGE_PAGE_SIZE, remaining),
        });

        if (page.messages.length === 0) {
          hasMore = false;
          break;
        }

        aggregatedMessages = [...page.messages, ...aggregatedMessages];
        hasMore = page.hasMore;

        if (!page.hasMore) {
          break;
        }

        const nextOldest = page.messages[0];
        beforeCursor = nextOldest
          ? { createdAt: nextOldest.created_at, id: nextOldest.id }
          : null;
        if (!beforeCursor) break;
      }

      return { messageList: aggregatedMessages, hasMore };
    };

    const loadMessages = async (reason: string) => {
      const loadId = ++latestLoadId;
      const startedAt = Date.now();
      logReload('load:start', { reason, loadId });
      try {
        const targetCount = Math.max(currentMessageList.length, MESSAGE_PAGE_SIZE);
        const { messageList, hasMore } = await fetchLatestMessageWindow(targetCount);
        const { reactionList, attachmentList, linkPreviewList } = await fetchRelatedForMessages(messageList);

        await updateMessageBundleState({
          reason,
          loadId,
          startedAt,
          messageList,
          reactionList,
          attachmentList,
          linkPreviewList,
          hasOlder: hasMore,
        });
      } catch (error) {
        if (!isMounted || loadId !== latestLoadId) return;
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
      if (olderLoadInFlight) return;
      if (!currentHasOlderMessages || !oldestLoadedCursor) return;

      olderLoadInFlight = true;
      setIsLoadingOlderMessages(true);
      const loadId = ++latestLoadId;
      const startedAt = Date.now();
      logReload('load-older:start', {
        loadId,
        cursorCreatedAt: oldestLoadedCursor.createdAt,
        cursorId: oldestLoadedCursor.id,
        currentMessageCount: currentMessageList.length,
      });

      try {
        const page = await communityBackend.listMessagesPage({
          communityId: currentServerId,
          channelId: currentChannelId,
          beforeCursor: oldestLoadedCursor,
          limit: MESSAGE_PAGE_SIZE,
        });

        if (page.messages.length === 0) {
          if (!isMounted || loadId !== latestLoadId) return;
          currentHasOlderMessages = false;
          setHasOlderMessages(false);
          logReload('load-older:complete', {
            loadId,
            addedCount: 0,
            durationMs: Date.now() - startedAt,
            hasOlderMessages: false,
          });
          return;
        }

        const existingIds = new Set(currentMessageList.map((message) => message.id));
        const prependMessages = page.messages.filter((message) => !existingIds.has(message.id));
        const nextMessageList = [...prependMessages, ...currentMessageList];
        const { reactionList, attachmentList, linkPreviewList } = await fetchRelatedForMessages(nextMessageList);

        await updateMessageBundleState({
          reason: 'load_older',
          loadId,
          startedAt,
          messageList: nextMessageList,
          reactionList,
          attachmentList,
          linkPreviewList,
          hasOlder: page.hasMore,
        });

        if (!isMounted || loadId !== latestLoadId) return;
        logReload('load-older:complete', {
          loadId,
          addedCount: prependMessages.length,
          durationMs: Date.now() - startedAt,
          hasOlderMessages: page.hasMore,
        });
      } catch (error) {
        if (!isMounted || loadId !== latestLoadId) return;
        console.error('Error loading older messages:', error);
        logReload('load-older:error', {
          loadId,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        if (isMounted) {
          setIsLoadingOlderMessages(false);
        }
        olderLoadInFlight = false;
      }
    };

    requestOlderMessagesRef.current = loadOlderMessages;

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
        const result = await communityBackend.runMessageMediaMaintenance(100);
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
      requestOlderMessagesRef.current = null;
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
  }, [user?.id, currentServerId, currentChannelId, currentChannelKind, debugChannelReloads]);

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

  async function loadServerSettings(communityId = currentServerId) {
    if (!communityId) {
      setServerSettingsInitialValues(null);
      return;
    }

    setServerSettingsLoadError(null);
    setServerSettingsLoading(true);

    try {
      const communityBackend = getCommunityDataBackend(communityId);
      const snapshot = await communityBackend.fetchServerSettings(communityId);
      setServerSettingsInitialValues({
        name: snapshot.name,
        description: snapshot.description,
        allowPublicInvites: snapshot.allowPublicInvites,
        requireReportReason: snapshot.requireReportReason,
        developerAccessEnabled: snapshot.developerAccessEnabled,
        developerAccessMode: snapshot.developerAccessMode as DeveloperAccessMode,
        developerAccessChannelIds: snapshot.developerAccessChannelIds,
      });
    } finally {
      setServerSettingsLoading(false);
    }
  }

  async function loadServerInvites(communityId = currentServerId) {
    if (!communityId) {
      setServerInvites([]);
      return;
    }

    setServerInvitesLoading(true);
    setServerInvitesError(null);
    try {
      const invites = await controlPlaneBackend.listActiveCommunityInvites(communityId);
      setServerInvites(
        invites.map((invite) => ({
          id: invite.id,
          code: invite.code,
          currentUses: invite.currentUses,
          maxUses: invite.maxUses,
          expiresAt: invite.expiresAt,
          isActive: invite.isActive,
        }))
      );
    } finally {
      setServerInvitesLoading(false);
    }
  }

  async function loadServerRoleManagement(communityId = currentServerId) {
    if (!communityId) {
      setServerRoles([]);
      setServerMembers([]);
      setServerPermissionCatalog([]);
      return;
    }

    setServerRoleManagementLoading(true);
    setServerRoleManagementError(null);

    try {
      const communityBackend = getCommunityDataBackend(communityId);
      const snapshot = await communityBackend.fetchServerRoleManagement(communityId);
      setServerRoles(snapshot.roles);
      setServerMembers(snapshot.members);
      setServerPermissionCatalog(snapshot.permissionsCatalog);
    } finally {
      setServerRoleManagementLoading(false);
    }
  }

  async function loadCommunityBans(communityId = currentServerId) {
    if (!communityId) {
      setCommunityBans([]);
      setCommunityBansError(null);
      return;
    }

    setCommunityBansLoading(true);
    setCommunityBansError(null);
    try {
      const communityBackend = getCommunityDataBackend(communityId);
      const bans = await communityBackend.listCommunityBans(communityId);
      setCommunityBans(bans);
    } catch (error: unknown) {
      setCommunityBans([]);
      setCommunityBansError(getErrorMessage(error, 'Failed to load bans.'));
      throw error;
    } finally {
      setCommunityBansLoading(false);
    }
  }

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

  const openServerSettingsModal = async (communityIdOverride?: string) => {
    const targetCommunityId = communityIdOverride ?? currentServerId;
    if (!targetCommunityId) return;
    if (targetCommunityId !== currentServerId) {
      setCurrentServerId(targetCommunityId);
      return;
    }

    setShowServerSettingsModal(true);
    setServerSettingsInitialValues(null);
    setServerSettingsLoadError(null);
    setServerInvitesError(null);
    setServerRoleManagementError(null);
    setCommunityBansError(null);

    try {
      await loadServerSettings(targetCommunityId);
    } catch (error: unknown) {
      console.error('Failed to load server settings:', error);
      setServerSettingsLoadError(getErrorMessage(error, 'Failed to load server settings.'));
    }

    if (serverPermissions.canManageInvites) {
      try {
        await loadServerInvites(targetCommunityId);
      } catch (error: unknown) {
        console.error('Failed to load server invites:', error);
        setServerInvitesError(getErrorMessage(error, 'Failed to load server invites.'));
      }
    } else {
      setServerInvites([]);
      setServerInvitesLoading(false);
      setServerInvitesError(null);
    }

    try {
      await loadServerRoleManagement(targetCommunityId);
    } catch (error: unknown) {
      console.error('Failed to load server role management:', error);
      setServerRoleManagementError(getErrorMessage(error, 'Failed to load server roles and members.'));
    }

    try {
      await loadCommunityBans(targetCommunityId);
    } catch (error: unknown) {
      console.error('Failed to load community bans:', error);
    }
  };

  async function createServerInvite(values: {
    maxUses: number | null;
    expiresInHours: number | null;
  }): Promise<ServerInviteItem> {
    if (!currentServerId) throw new Error('No server selected.');

    const invite = await controlPlaneBackend.createCommunityInvite({
      communityId: currentServerId,
      maxUses: values.maxUses,
      expiresInHours: values.expiresInHours,
    });

    await loadServerInvites();
    return {
      id: invite.id,
      code: invite.code,
      currentUses: invite.currentUses,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt,
      isActive: invite.isActive,
    };
  }

  async function revokeServerInvite(inviteId: string): Promise<void> {
    if (!currentServerId) throw new Error('No server selected.');

    await controlPlaneBackend.revokeCommunityInvite(currentServerId, inviteId);
    await loadServerInvites();
  }

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

  async function openServerMembersModal(communityId: string) {
    const server = servers.find((candidate) => candidate.id === communityId);
    setShowMembersModal(true);
    setMembersModalCommunityId(communityId);
    setMembersModalServerName(server?.name ?? 'Server');
    setMembersModalMembers([]);
    setMembersModalError(null);
    setMembersModalLoading(true);
    setMembersModalCanCreateReports(false);
    setMembersModalCanManageBans(false);

    try {
      const communityBackend = getCommunityDataBackend(communityId);
      const [members, permissions] = await Promise.all([
        communityBackend.listCommunityMembers(communityId),
        communityBackend.fetchServerPermissions(communityId),
      ]);
      setMembersModalMembers(members);
      setMembersModalCanCreateReports(Boolean(permissions.canCreateReports));
      setMembersModalCanManageBans(Boolean(permissions.canManageBans));
    } catch (error: unknown) {
      setMembersModalError(getErrorMessage(error, 'Failed to load server members.'));
    } finally {
      setMembersModalLoading(false);
    }
  }

  async function leaveServer(communityId: string) {
    await controlPlaneBackend.leaveCommunity(communityId);
    if (currentServerId === communityId) {
      setCurrentServerId(null);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
      setShowMembersModal(false);
    }
    await refreshServers();
  }

  async function deleteServer(communityId: string) {
    await controlPlaneBackend.deleteCommunity(communityId);
    if (currentServerId === communityId) {
      setCurrentServerId(null);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
      setChannelSettingsTargetId(null);
      setShowMembersModal(false);
    }
    await refreshServers();
  }

  async function renameServer(communityId: string, name: string) {
    await controlPlaneBackend.renameCommunity({
      communityId,
      name,
    });
    await refreshServers();
    if (currentServerId === communityId && showServerSettingsModal) {
      await loadServerSettings(communityId);
    }
  }

  async function saveServerSettings(values: ServerSettingsValues) {
    if (!currentServerId || !user) throw new Error('Not authenticated');

    const trimmedName = values.name.trim();
    if (!trimmedName) {
      throw new Error('Server name is required.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.updateServerSettings({
      communityId: currentServerId,
      userId: user.id,
      values: {
        name: trimmedName,
        description: values.description,
        allowPublicInvites: values.allowPublicInvites,
        requireReportReason: values.requireReportReason,
        developerAccessEnabled: values.developerAccessEnabled,
        developerAccessMode: values.developerAccessMode,
        developerAccessChannelIds: values.developerAccessChannelIds,
      },
      canManageDeveloperAccess: serverPermissions.canManageDeveloperAccess,
    });

    await refreshServers();
    await loadServerSettings();
  }

  async function createServerRole(input: { name: string; color: string; position: number }) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.createServerRole({
      communityId: currentServerId,
      name: input.name,
      color: input.color,
      position: input.position,
    });

    await loadServerRoleManagement();
  }

  async function updateServerRole(input: {
    roleId: string;
    name: string;
    color: string;
    position: number;
  }) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.updateServerRole({
      communityId: currentServerId,
      roleId: input.roleId,
      name: input.name,
      color: input.color,
      position: input.position,
    });

    await loadServerRoleManagement();
  }

  async function deleteServerRole(roleId: string) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.deleteServerRole({
      communityId: currentServerId,
      roleId,
    });

    await loadServerRoleManagement();
  }

  async function saveServerRolePermissions(roleId: string, permissionKeys: string[]) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveServerRolePermissions({
      roleId,
      permissionKeys,
    });

    await loadServerRoleManagement();
  }

  async function saveServerMemberRoles(memberId: string, roleIds: string[]) {
    if (!currentServerId || !user) throw new Error('Not authenticated');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveServerMemberRoles({
      communityId: currentServerId,
      memberId,
      roleIds,
      assignedByUserId: user.id,
    });

    await loadServerRoleManagement();
  }

  async function createChannel(values: {
    name: string;
    topic: string | null;
    kind: ChannelKind;
  }) {
    if (!user || !currentServerId) throw new Error('Not authenticated');

    const nextPosition =
      channels.length === 0 ? 0 : Math.max(...channels.map((channel) => channel.position)) + 1;

    const communityBackend = getCommunityDataBackend(currentServerId);
    const channel = await communityBackend.createChannel({
      communityId: currentServerId,
      name: values.name,
      topic: values.topic,
      position: nextPosition,
      kind: values.kind,
    });

    setChannels((prev) => {
      if (prev.some((existingChannel) => existingChannel.id === channel.id)) return prev;
      return [...prev, channel].sort((a, b) => a.position - b.position);
    });
    setCurrentChannelId(channel.id);
  }

  async function loadChannelPermissions(targetChannelId = channelSettingsTargetId ?? currentChannelId) {
    if (!currentServerId || !targetChannelId || !user) {
      setChannelRolePermissions([]);
      setChannelMemberPermissions([]);
      setChannelPermissionMemberOptions([]);
      return;
    }

    setChannelPermissionsLoadError(null);
    setChannelPermissionsLoading(true);
    try {
      const communityBackend = getCommunityDataBackend(currentServerId);
      const snapshot = await communityBackend.fetchChannelPermissions({
        communityId: currentServerId,
        channelId: targetChannelId,
        userId: user.id,
      });

      setChannelRolePermissions(snapshot.rolePermissions);
      setChannelMemberPermissions(snapshot.memberPermissions);
      setChannelPermissionMemberOptions(snapshot.memberOptions);
    } finally {
      setChannelPermissionsLoading(false);
    }
  }

  const openChannelSettingsModal = async (channelId?: string) => {
    const targetChannelId = channelId ?? currentChannelId;
    if (!targetChannelId) return;
    setChannelSettingsTargetId(targetChannelId);
    setShowChannelSettingsModal(true);
    setChannelPermissionsLoadError(null);
    try {
      await loadChannelPermissions(targetChannelId);
    } catch (error: unknown) {
      console.error('Failed to load channel permissions:', error);
      setChannelPermissionsLoadError(getErrorMessage(error, 'Failed to load channel permissions.'));
    }
  };

  async function saveRoleChannelPermissions(roleId: string, permissions: ChannelPermissionState) {
    const targetChannelId = channelSettingsTargetId ?? currentChannelId;
    if (!currentServerId || !targetChannelId) throw new Error('No channel selected.');

    const roleRow = channelRolePermissions.find((row) => row.roleId === roleId);
    if (roleRow && !roleRow.editable) {
      throw new Error('You can only edit overwrites for roles below your highest role.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveRoleChannelPermissions({
      communityId: currentServerId,
      channelId: targetChannelId,
      roleId,
      permissions,
    });

    setChannelRolePermissions((prev) =>
      prev.map((row) =>
        row.roleId === roleId
          ? {
              ...row,
              canView: permissions.canView,
              canSend: permissions.canSend,
              canManage: permissions.canManage,
            }
          : row
      )
    );
  }

  async function saveMemberChannelPermissions(
    memberId: string,
    permissions: ChannelPermissionState
  ) {
    const targetChannelId = channelSettingsTargetId ?? currentChannelId;
    if (!currentServerId || !targetChannelId) throw new Error('No channel selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveMemberChannelPermissions({
      communityId: currentServerId,
      channelId: targetChannelId,
      memberId,
      permissions,
    });

    setChannelMemberPermissions((prev) =>
      prev.map((row) =>
        row.memberId === memberId
          ? {
              ...row,
              canView: permissions.canView,
              canSend: permissions.canSend,
              canManage: permissions.canManage,
            }
          : row
      )
    );
  }

  async function saveChannelSettings(values: { name: string; topic: string | null }) {
    const channelIdToUpdate = channelSettingsTargetId ?? currentChannelId;
    if (!currentServerId || !channelIdToUpdate) throw new Error('No channel selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.updateChannel({
      communityId: currentServerId,
      channelId: channelIdToUpdate,
      name: values.name,
      topic: values.topic,
    });

    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelIdToUpdate
          ? { ...channel, name: values.name, topic: values.topic }
          : channel
      )
    );
  }

  async function renameChannel(channelId: string, name: string) {
    if (!currentServerId) throw new Error('No server selected.');
    const channelRow = channels.find((candidate) => candidate.id === channelId);
    if (!channelRow) throw new Error('Channel not found.');

    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Channel name is required.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.updateChannel({
      communityId: currentServerId,
      channelId,
      name: normalizedName,
      topic: channelRow.topic,
    });

    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId
          ? { ...channel, name: normalizedName }
          : channel
      )
    );
  }

  async function deleteChannel(channelId: string) {
    if (!currentServerId) throw new Error('No server selected.');
    if (channels.length <= 1) {
      throw new Error('At least one channel must exist in a server.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.deleteChannel({
      communityId: currentServerId,
      channelId,
    });

    setChannels((prev) => {
      const next = prev.filter((channel) => channel.id !== channelId);
      setCurrentChannelId((prevCurrentId) => {
        if (prevCurrentId !== channelId) return prevCurrentId;
        return next.length > 0 ? next[0].id : null;
      });
      return next;
    });

    setChannelSettingsTargetId((prevTargetId) => (prevTargetId === channelId ? null : prevTargetId));
  }

  async function deleteCurrentChannel() {
    const targetChannelId = channelSettingsTargetId ?? currentChannelId;
    if (!targetChannelId) throw new Error('No channel selected.');
    await deleteChannel(targetChannelId);
    setShowChannelSettingsModal(false);
  }

  async function refreshChannelGroupsState(communityId = currentServerId, channelIds = channels.map((channel) => channel.id)) {
    if (!communityId) {
      setChannelGroupState({
        groups: [],
        ungroupedChannelIds: [],
        collapsedGroupIds: [],
      });
      return;
    }

    const communityBackend = getCommunityDataBackend(communityId);
    const nextState = await communityBackend.listChannelGroups({
      communityId,
      channelIds,
    });
    setChannelGroupState(nextState);
  }

  async function createChannelGroup(name: string, channelIdToAssign?: string | null) {
    if (!currentServerId || !user) throw new Error('Not authenticated.');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Group name is required.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    const nextPosition =
      channelGroupState.groups.length === 0
        ? 0
        : Math.max(...channelGroupState.groups.map((group) => group.position)) + 1;

    const createdGroup = await communityBackend.createChannelGroup({
      communityId: currentServerId,
      name: normalizedName,
      position: nextPosition,
      createdByUserId: user.id,
    });

    if (channelIdToAssign) {
      await communityBackend.setChannelGroupForChannel({
        communityId: currentServerId,
        channelId: channelIdToAssign,
        groupId: createdGroup.id,
        position: 0,
      });
    }

    await refreshChannelGroupsState(currentServerId);
  }

  async function assignChannelToGroup(channelId: string, groupId: string) {
    if (!currentServerId) throw new Error('No server selected.');

    const targetGroup = channelGroupState.groups.find((group) => group.id === groupId);
    if (!targetGroup) throw new Error('Group no longer exists.');

    const communityBackend = getCommunityDataBackend(currentServerId);

    await communityBackend.setChannelGroupForChannel({
      communityId: currentServerId,
      channelId,
      groupId,
      position: targetGroup.channelIds.length,
    });

    await refreshChannelGroupsState(currentServerId);
  }

  async function removeChannelFromGroup(channelId: string) {
    if (!currentServerId) throw new Error('No server selected.');
    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.setChannelGroupForChannel({
      communityId: currentServerId,
      channelId,
      groupId: null,
      position: 0,
    });
    await refreshChannelGroupsState(currentServerId);
  }

  async function setChannelGroupCollapsed(groupId: string, isCollapsed: boolean) {
    if (!currentServerId) throw new Error('No server selected.');
    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.setChannelGroupCollapsed({
      communityId: currentServerId,
      groupId,
      isCollapsed,
    });

    setChannelGroupState((prev) => ({
      ...prev,
      collapsedGroupIds: isCollapsed
        ? Array.from(new Set([...prev.collapsedGroupIds, groupId]))
        : prev.collapsedGroupIds.filter((id) => id !== groupId),
    }));
  }

  async function renameChannelGroup(groupId: string, name: string) {
    if (!currentServerId) throw new Error('No server selected.');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Group name is required.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.renameChannelGroup({
      communityId: currentServerId,
      groupId,
      name: normalizedName,
    });
    setChannelGroupState((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id === groupId ? { ...group, name: normalizedName } : group
      ),
    }));
  }

  async function deleteChannelGroup(groupId: string) {
    if (!currentServerId) throw new Error('No server selected.');
    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.deleteChannelGroup({
      communityId: currentServerId,
      groupId,
    });
    await refreshChannelGroupsState(currentServerId);
  }

  async function sendMessage(
    content: string,
    options?: { replyToMessageId?: string; mediaFile?: File; mediaExpiresInHours?: number }
  ) {
    if (!user || !currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.sendUserMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      userId: user.id,
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

  async function toggleMessageReaction(messageId: string, emoji: string) {
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.toggleMessageReaction({
      communityId: currentServerId,
      channelId: currentChannelId,
      messageId,
      emoji,
    });
  }

  async function editMessage(messageId: string, content: string) {
    if (!currentServerId) throw new Error('No server selected.');
    const trimmedContent = content.trim();
    if (!trimmedContent) throw new Error('Message content is required.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.editUserMessage({
      communityId: currentServerId,
      messageId,
      content: trimmedContent,
    });
  }

  async function deleteMessage(messageId: string) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.deleteMessage({
      communityId: currentServerId,
      messageId,
    });
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    setMessageReactions((prev) => prev.filter((reaction) => reaction.messageId !== messageId));
    setMessageAttachments((prev) => prev.filter((attachment) => attachment.messageId !== messageId));
    setMessageLinkPreviews((prev) => prev.filter((preview) => preview.messageId !== messageId));
  }

  async function reportMessage(input: {
    messageId: string;
    target: MessageReportTarget;
    kind: MessageReportKind;
    comment: string;
  }) {
    if (!user || !currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.reportMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      messageId: input.messageId,
      reporterUserId: user.id,
      target: input.target,
      kind: input.kind,
      comment: input.comment,
    });
  }

  async function requestMessageLinkPreviewRefresh(messageId: string) {
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      throw new Error('Link previews can only be refreshed in text channels.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.requestChannelLinkPreviewBackfill({
      communityId: currentServerId,
      channelId: currentChannelId,
      messageIds: [messageId],
    });
  }

  async function requestOlderMessages() {
    const loader = requestOlderMessagesRef.current;
    if (!loader) return;
    await loader();
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

    if (showMembersModal && membersModalCommunityId === input.communityId) {
      try {
        const members = await communityBackend.listCommunityMembers(input.communityId);
        setMembersModalMembers(members);
      } catch (error) {
        console.error('Failed to refresh members after ban:', error);
      }
    }

    if (showServerSettingsModal && currentServerId === input.communityId) {
      try {
        await loadCommunityBans(input.communityId);
      } catch (error) {
        console.error('Failed to refresh bans after ban:', error);
      }
    }
  }

  async function unbanUserFromCurrentServer(input: {
    targetUserId: string;
    reason?: string | null;
  }) {
    if (!currentServerId) throw new Error('No server selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.unbanCommunityMember({
      communityId: currentServerId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    });

    await loadCommunityBans(currentServerId);

    if (showMembersModal && membersModalCommunityId === currentServerId) {
      const members = await communityBackend.listCommunityMembers(currentServerId);
      setMembersModalMembers(members);
    }
  }

  async function resolveBanEligibleServers(targetUserId: string): Promise<BanEligibleServer[]> {
    if (!targetUserId) return [];
    return controlPlaneBackend.listBanEligibleServersForUser(targetUserId);
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
    if (!dmWorkspaceEnabled) {
      window.alert('Direct messages are coming soon.');
      return;
    }

    void openDirectMessageWithUser(targetUserId).catch((error) => {
      window.alert(getErrorMessage(error, 'Failed to open direct message.'));
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
        refreshDmMessages(selectedDmConversationId, { suppressLoadingState: true, markRead: true }),
        refreshDmConversations({ suppressLoadingState: true }),
      ]);
    } catch (error) {
      setDmMessagesError(getErrorMessage(error, 'Failed to send direct message.'));
      throw error;
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

    setProfileUsername(values.username);
    setProfileAvatarUrl(values.avatarUrl);
  }

  async function setAutoUpdateEnabled(enabled: boolean) {
    const result = await desktopClient.setAutoUpdateEnabled(enabled);
    setAppSettings(result.settings);
    setUpdaterStatus(result.updaterStatus);
  }

  async function setNotificationAudioSettings(values: NotificationAudioSettings) {
    setNotificationAudioSettingsSaving(true);
    setNotificationAudioSettingsError(null);
    try {
      const result = await desktopClient.setNotificationAudioSettings(values);
      setAppSettings(result.settings);
    } catch (error) {
      setNotificationAudioSettingsError(
        getErrorMessage(error, 'Failed to update local notification audio settings.')
      );
    } finally {
      setNotificationAudioSettingsSaving(false);
    }
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

  async function checkForUpdatesNow() {
    setCheckingForUpdates(true);
    try {
      const status = await desktopClient.checkForUpdates();
      setUpdaterStatus(status);
    } finally {
      setCheckingForUpdates(false);
    }
  }

  const handleLeaveServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    const confirmed = window.confirm(`Leave "${server?.name ?? 'this server'}"?`);
    if (!confirmed) return;

    void leaveServer(communityId).catch((error: unknown) => {
      window.alert(getErrorMessage(error, 'Failed to leave server.'));
    });
  };

  const handleDeleteServer = (communityId: string) => {
    const server = servers.find((candidate) => candidate.id === communityId);
    const confirmed = window.confirm(`Delete "${server?.name ?? 'this server'}"? This cannot be undone.`);
    if (!confirmed) return;

    void deleteServer(communityId).catch((error: unknown) => {
      window.alert(getErrorMessage(error, 'Failed to delete server.'));
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
    const confirmed = window.confirm(`Delete channel "${channel.name}"? This cannot be undone.`);
    if (!confirmed) return;

    void deleteChannel(channelId).catch((error: unknown) => {
      window.alert(getErrorMessage(error, 'Failed to delete channel.'));
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
    const confirmed = window.confirm(`Delete group "${group.name}"? Channels will become ungrouped.`);
    if (!confirmed) return;

    void deleteChannelGroup(groupId).catch((error: unknown) => {
      window.alert(getErrorMessage(error, 'Failed to delete channel group.'));
    });
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
  const currentServer = servers.find((s) => s.id === currentServerId);
  const currentChannel = channels.find((channel) => channel.id === currentChannelId);
  const currentChannelBelongsToCurrentServer = Boolean(
    currentChannel && currentServerId && currentChannel.community_id === currentServerId
  );
  const channelSettingsTarget = channels.find(
    (channel) => channel.id === (channelSettingsTargetId ?? currentChannelId)
  );
  const currentRenderableChannel =
    currentChannel && currentChannelBelongsToCurrentServer && currentChannel.kind === 'text'
      ? currentChannel
      : channels.find(
          (channel) => channel.kind === 'text' && (!currentServerId || channel.community_id === currentServerId)
        ) ??
        (currentChannelBelongsToCurrentServer ? currentChannel : null);
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
                        window.alert(getErrorMessage(error, 'Failed to assign channel to group.'));
                      });
                    }
                  : undefined
              }
              onRemoveChannelFromGroup={
                serverPermissions.canManageChannels
                  ? (channelId) => {
                      void removeChannelFromGroup(channelId).catch((error: unknown) => {
                        window.alert(getErrorMessage(error, 'Failed to remove channel from group.'));
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
        onClose={() => {
          setShowMembersModal(false);
          setMembersModalCommunityId(null);
          setMembersModalMembers([]);
          setMembersModalError(null);
          setMembersModalCanCreateReports(false);
          setMembersModalCanManageBans(false);
        }}
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

function App() {
  return (
    <AuthProvider>
      <ChatApp />
    </AuthProvider>
  );
}

const root = createRoot(document.body);
root.render(
  <TooltipProvider>
    <App />
  </TooltipProvider>
);

