import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoginScreen } from '@/components/LoginScreen';
import { ServerList } from '@/components/ServerList';
import { CreateServerModal } from '@/components/CreateServerModal';
import { CreateChannelModal } from '@/components/CreateChannelModal';
import { JoinServerModal } from '@/components/JoinServerModal';
import { AccountSettingsModal } from '@/components/AccountSettingsModal';
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
import { getCommunityDataBackend, getControlPlaneBackend } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import { desktopClient } from '@/shared/desktop/client';
import { getErrorMessage } from '@/shared/lib/errors';
import type { AppSettings, UpdaterStatus } from '@/shared/desktop/types';
import type {
  AuthorProfile,
  Channel,
  ChannelKind,
  DeveloperAccessMode,
  PermissionCatalogItem,
  MessageReportKind,
  MessageReportTarget,
  Message,
  ServerMemberRoleItem,
  ServerPermissions,
  ServerRoleItem,
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

function ChatApp() {
  const controlPlaneBackend = getControlPlaneBackend();
  const { user, status: authStatus, error: authError, signOut } = useAuth();
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
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [profileUsername, setProfileUsername] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [platformStaffPrefix, setPlatformStaffPrefix] = useState<string | null>(null);
  const [canPostHavenDevMessage, setCanPostHavenDevMessage] = useState(false);
  const [canSendHavenDeveloperMessage, setCanSendHavenDeveloperMessage] = useState(false);
  const [canSpeakInVoiceChannel, setCanSpeakInVoiceChannel] = useState(false);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
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
  const [appSettings, setAppSettings] = useState<AppSettings>({
    schemaVersion: 1,
    autoUpdateEnabled: true,
  });
  const [appSettingsLoading, setAppSettingsLoading] = useState(true);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus | null>(null);
  const [updaterStatusLoading, setUpdaterStatusLoading] = useState(true);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);

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
      setAuthorProfiles({});
      setServerPermissions({
        isOwner: false,
        canManageServer: false,
        canManageRoles: false,
        canManageMembers: false,
        canCreateChannels: false,
        canManageChannels: false,
        canManageMessages: false,
        canManageDeveloperAccess: false,
        canManageInvites: false,
      });
      setServerSettingsInitialValues(null);
      setShowCreateChannelModal(false);
      setShowJoinServerModal(false);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
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

  // Auto-select first server
  useEffect(() => {
    if (servers.length > 0 && !currentServerId) {
      setCurrentServerId(servers[0].id);
    }
  }, [servers, currentServerId]);

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
      setAuthorProfiles({});
      setCanSpeakInVoiceChannel(false);
      setShowCreateChannelModal(false);
      setShowJoinServerModal(false);
      setShowServerSettingsModal(false);
      setShowChannelSettingsModal(false);
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
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const loadChannels = async () => {
      setChannelsLoading(true);
      setChannelsError(null);
      try {
        const channelList = await communityBackend.listChannels(currentServerId);

        if (!isMounted) return;

        setChannels(channelList);
        setCurrentChannelId((prev) => {
          if (channelList.length === 0) return null;
          if (prev && channelList.some((channel) => channel.id === prev)) return prev;
          const firstTextChannel = channelList.find((channel) => channel.kind === 'text');
          return firstTextChannel?.id ?? channelList[0].id;
        });
      } catch (error: unknown) {
        if (!isMounted) return;
        console.error('Error loading channels:', error);
        setChannels([]);
        setCurrentChannelId(null);
        setChannelsError(getErrorMessage(error, 'Failed to load channels.'));
      }

      setChannelsLoading(false);
    };

    void loadChannels();

    const subscription = communityBackend.subscribeToChannels(currentServerId, () => {
      void loadChannels();
    });

    return () => {
      isMounted = false;
      void subscription.unsubscribe();
    };
  }, [currentServerId]);

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
      setAuthorProfiles({});
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (selectedChannel?.kind === 'voice') {
      setMessages([]);
      setAuthorProfiles({});
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const loadMessages = async () => {
      try {
        const messageList = await communityBackend.listMessages(currentServerId, currentChannelId);

        if (!isMounted) return;
        setMessages(messageList);

        const authorIds = Array.from(
          new Set(
            messageList
              .map((message) => message.author_user_id)
              .filter((authorId): authorId is string => Boolean(authorId))
          )
        );

        if (authorIds.length === 0) {
          setAuthorProfiles({});
          return;
        }

        const profileMap = await communityBackend.fetchAuthorProfiles(authorIds);

        if (!isMounted) return;
        setAuthorProfiles(profileMap);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error loading messages:', error);
      }
    };

    void loadMessages();

    const channel = communityBackend.subscribeToMessages(currentChannelId, () => {
      void loadMessages();
    });

    return () => {
      isMounted = false;
      void channel.unsubscribe();
    };
  }, [user, currentServerId, currentChannelId, channels]);

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

  async function loadServerSettings() {
    if (!currentServerId) {
      setServerSettingsInitialValues(null);
      return;
    }

    setServerSettingsLoadError(null);
    setServerSettingsLoading(true);

    try {
      const communityBackend = getCommunityDataBackend(currentServerId);
      const snapshot = await communityBackend.fetchServerSettings(currentServerId);
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

  async function loadServerInvites() {
    if (!currentServerId) {
      setServerInvites([]);
      return;
    }

    setServerInvitesLoading(true);
    setServerInvitesError(null);
    try {
      const invites = await controlPlaneBackend.listActiveCommunityInvites(currentServerId);
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

  async function loadServerRoleManagement() {
    if (!currentServerId) {
      setServerRoles([]);
      setServerMembers([]);
      setServerPermissionCatalog([]);
      return;
    }

    setServerRoleManagementLoading(true);
    setServerRoleManagementError(null);

    try {
      const communityBackend = getCommunityDataBackend(currentServerId);
      const snapshot = await communityBackend.fetchServerRoleManagement(currentServerId);
      setServerRoles(snapshot.roles);
      setServerMembers(snapshot.members);
      setServerPermissionCatalog(snapshot.permissionsCatalog);
    } finally {
      setServerRoleManagementLoading(false);
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

  const openServerSettingsModal = async () => {
    setShowServerSettingsModal(true);
    setServerSettingsInitialValues(null);
    setServerSettingsLoadError(null);
    setServerInvitesError(null);
    setServerRoleManagementError(null);

    try {
      await loadServerSettings();
    } catch (error: unknown) {
      console.error('Failed to load server settings:', error);
      setServerSettingsLoadError(getErrorMessage(error, 'Failed to load server settings.'));
    }

    if (serverPermissions.canManageInvites) {
      try {
        await loadServerInvites();
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
      await loadServerRoleManagement();
    } catch (error: unknown) {
      console.error('Failed to load server role management:', error);
      setServerRoleManagementError(getErrorMessage(error, 'Failed to load server roles and members.'));
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

  async function loadChannelPermissions() {
    if (!currentServerId || !currentChannelId || !user) {
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
        channelId: currentChannelId,
        userId: user.id,
      });

      setChannelRolePermissions(snapshot.rolePermissions);
      setChannelMemberPermissions(snapshot.memberPermissions);
      setChannelPermissionMemberOptions(snapshot.memberOptions);
    } finally {
      setChannelPermissionsLoading(false);
    }
  }

  const openChannelSettingsModal = async () => {
    setShowChannelSettingsModal(true);
    setChannelPermissionsLoadError(null);
    try {
      await loadChannelPermissions();
    } catch (error: unknown) {
      console.error('Failed to load channel permissions:', error);
      setChannelPermissionsLoadError(getErrorMessage(error, 'Failed to load channel permissions.'));
    }
  };

  async function saveRoleChannelPermissions(roleId: string, permissions: ChannelPermissionState) {
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const roleRow = channelRolePermissions.find((row) => row.roleId === roleId);
    if (roleRow && !roleRow.editable) {
      throw new Error('You can only edit overwrites for roles below your highest role.');
    }

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveRoleChannelPermissions({
      communityId: currentServerId,
      channelId: currentChannelId,
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
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.saveMemberChannelPermissions({
      communityId: currentServerId,
      channelId: currentChannelId,
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
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');

    const channelIdToUpdate = currentChannelId;
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

  async function deleteCurrentChannel() {
    if (!currentServerId || !currentChannelId) throw new Error('No channel selected.');
    if (channels.length <= 1) {
      throw new Error('At least one channel must exist in a server.');
    }

    const channelIdToDelete = currentChannelId;
    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.deleteChannel({
      communityId: currentServerId,
      channelId: channelIdToDelete,
    });

    setChannels((prev) => {
      const next = prev.filter((channel) => channel.id !== channelIdToDelete);
      setCurrentChannelId((prevCurrentId) => {
        if (prevCurrentId !== channelIdToDelete) return prevCurrentId;
        return next.length > 0 ? next[0].id : null;
      });
      return next;
    });
  }

  async function sendMessage(content: string, options?: { replyToMessageId?: string }) {
    if (!user || !currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.sendUserMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      userId: user.id,
      content,
      replyToMessageId: options?.replyToMessageId,
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

  async function sendHavenDeveloperMessage(content: string) {
    if (!currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.postHavenDeveloperMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      content,
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

  async function checkForUpdatesNow() {
    setCheckingForUpdates(true);
    try {
      const status = await desktopClient.checkForUpdates();
      setUpdaterStatus(status);
    } finally {
      setCheckingForUpdates(false);
    }
  }

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
  const currentRenderableChannel =
    currentChannel && currentChannel.kind === 'text'
      ? currentChannel
      : channels.find((channel) => channel.kind === 'text') ?? currentChannel ?? null;
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
    serverPermissions.canManageInvites ||
    serverPermissions.canManageDeveloperAccess;

  return (
    <>
      <div className="flex h-screen bg-[#111a2b] text-[#e6edf7]">
        <ServerList
          servers={servers}
          currentServerId={currentServerId}
          onServerClick={setCurrentServerId}
          onCreateServer={() => setShowCreateModal(true)}
          onJoinServer={() => setShowJoinServerModal(true)}
          userDisplayName={userDisplayName}
          userAvatarUrl={profileAvatarUrl}
          onOpenAccountSettings={() => setShowAccountModal(true)}
        />

        {isServersLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#a9b8cf]">Loading servers...</p>
          </div>
        ) : currentServer ? (
          <>
            <Sidebar
              serverName={currentServer.name}
              userName={userDisplayName}
              channels={channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                kind: channel.kind,
              }))}
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
              onOpenServerSettings={
                canOpenServerSettings ? () => void openServerSettingsModal() : undefined
              }
            />
            {channelsLoading ? (
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
                authorProfiles={authorProfiles}
                currentUserId={user.id}
                canSpeakInVoiceChannel={canSpeakInVoiceChannel}
                canManageMessages={serverPermissions.canManageMessages}
                showVoiceDiagnostics={isPlatformStaff}
                onOpenChannelSettings={
                  serverPermissions.canManageChannels
                    ? () => void openChannelSettingsModal()
                    : undefined
                }
                onOpenVoiceControls={() => setVoicePanelOpen(true)}
                onSendMessage={sendMessage}
                onEditMessage={editMessage}
                onDeleteMessage={deleteMessage}
                onReportMessage={reportMessage}
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
        />
      )}

      {showChannelSettingsModal && currentChannel && serverPermissions.canManageChannels && (
        <ChannelSettingsModal
          initialName={currentChannel.name}
          initialTopic={currentChannel.topic}
          canDelete={channels.length > 1}
          rolePermissions={channelRolePermissions}
          memberPermissions={channelMemberPermissions}
          availableMembers={channelPermissionMemberOptions}
          permissionsLoading={channelPermissionsLoading}
          permissionsLoadError={channelPermissionsLoadError}
          onClose={() => setShowChannelSettingsModal(false)}
          onSave={saveChannelSettings}
          onDelete={deleteCurrentChannel}
          onSaveRolePermissions={saveRoleChannelPermissions}
          onSaveMemberPermissions={saveMemberChannelPermissions}
        />
      )}

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

