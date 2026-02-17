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
import { TooltipProvider } from '@/components/ui/tooltip';
import { useServers } from '@/lib/hooks/useServers';
import { getCommunityDataBackend, getControlPlaneBackend } from '@/lib/backend';
import type { AppSettings, UpdaterStatus } from '@/types/desktop-api';
import type {
  AuthorProfile,
  Channel,
  ChannelKind,
  DeveloperAccessMode,
  Message,
  ServerPermissions,
} from '@/lib/backend/types';
import '@/styles/globals.css';

function ChatApp() {
  const controlPlaneBackend = getControlPlaneBackend();
  const { user, session, status: authStatus, error: authError, signOut } = useAuth();
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
  const [serverPermissions, setServerPermissions] = useState<ServerPermissions>({
    isOwner: false,
    canManageServer: false,
    canCreateChannels: false,
    canManageChannels: false,
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
      setAuthorProfiles({});
      setServerPermissions({
        isOwner: false,
        canManageServer: false,
        canCreateChannels: false,
        canManageChannels: false,
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
      const desktopBridge = window.havenDesktop;

      if (!desktopBridge) {
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
        desktopBridge.getAppSettings(),
        desktopBridge.getUpdaterStatus(),
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
        canCreateChannels: false,
        canManageChannels: false,
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
          canCreateChannels: false,
          canManageChannels: false,
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
          return channelList[0].id;
        });
      } catch (error: any) {
        if (!isMounted) return;
        console.error('Error loading channels:', error);
        setChannels([]);
        setCurrentChannelId(null);
        setChannelsError(error?.message ?? 'Failed to load channels.');
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

    if (!user || !currentServerId || !currentChannelId) {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const selectedChannel = channels.find((channel) => channel.id === currentChannelId);
    if (!selectedChannel || selectedChannel.kind !== 'voice') {
      setCanSpeakInVoiceChannel(false);
      return;
    }

    const communityBackend = getCommunityDataBackend(currentServerId);

    const resolveVoiceSpeakPermission = async () => {
      try {
        const canSpeak = await communityBackend.canSendInChannel(currentChannelId);
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
  }, [user, currentServerId, currentChannelId, channels]);

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

    try {
      await loadServerSettings();
    } catch (error: any) {
      console.error('Failed to load server settings:', error);
      setServerSettingsLoadError(error?.message ?? 'Failed to load server settings.');
    }

    try {
      await loadServerInvites();
    } catch (error: any) {
      console.error('Failed to load server invites:', error);
      setServerInvitesError(error?.message ?? 'Failed to load server invites.');
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
      createdByUserId: user.id,
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
    } catch (error: any) {
      console.error('Failed to load channel permissions:', error);
      setChannelPermissionsLoadError(error?.message ?? 'Failed to load channel permissions.');
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

  async function sendMessage(content: string) {
    if (!user || !currentChannelId || !currentServerId) return;

    const communityBackend = getCommunityDataBackend(currentServerId);
    await communityBackend.sendUserMessage({
      communityId: currentServerId,
      channelId: currentChannelId,
      userId: user.id,
      content,
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
    const desktopBridge = window.havenDesktop;
    if (!desktopBridge) {
      throw new Error('Desktop bridge unavailable.');
    }

    const result = await desktopBridge.setAutoUpdateEnabled(enabled);
    setAppSettings(result.settings);
    setUpdaterStatus(result.updaterStatus);
  }

  async function checkForUpdatesNow() {
    const desktopBridge = window.havenDesktop;
    if (!desktopBridge) {
      throw new Error('Desktop bridge unavailable.');
    }

    setCheckingForUpdates(true);
    try {
      const status = await desktopBridge.checkForUpdates();
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
  const baseUserDisplayName = profileUsername || user.email?.split('@')[0] || 'User';
  const userDisplayName = isPlatformStaff
    ? `${platformStaffPrefix ?? 'Haven'}-${baseUserDisplayName}`
    : baseUserDisplayName;

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
              onCreateChannel={
                serverPermissions.canCreateChannels ? () => setShowCreateChannelModal(true) : undefined
              }
              onOpenServerSettings={
                serverPermissions.canManageServer ? () => void openServerSettingsModal() : undefined
              }
            />
            {channelsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#a9b8cf]">Loading channels...</p>
              </div>
            ) : currentChannel ? (
              <ChatArea
                communityId={currentServer.id}
                channelId={currentChannel.id}
                channelName={currentChannel.name}
                channelKind={currentChannel.kind}
                currentUserDisplayName={userDisplayName}
                messages={messages}
                authorProfiles={authorProfiles}
                currentUserId={user.id}
                accessToken={session?.access_token ?? null}
                canSpeakInVoiceChannel={canSpeakInVoiceChannel}
                showVoiceDiagnostics={isPlatformStaff}
                onOpenChannelSettings={
                  serverPermissions.canManageChannels
                    ? () => void openChannelSettingsModal()
                    : undefined
                }
                onSendMessage={sendMessage}
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

      {showServerSettingsModal && currentServerId && serverPermissions.canManageServer && (
        <ServerSettingsModal
          channels={channels.map((channel) => ({ id: channel.id, name: channel.name }))}
          initialValues={serverSettingsInitialValues}
          loadingInitialValues={serverSettingsLoading}
          initialLoadError={serverSettingsLoadError}
          canManageDeveloperAccess={serverPermissions.canManageDeveloperAccess}
          canManageInvites={serverPermissions.canManageInvites}
          invites={serverInvites}
          invitesLoading={serverInvitesLoading}
          invitesError={serverInvitesError}
          inviteBaseUrl="haven://invite/"
          onClose={() => setShowServerSettingsModal(false)}
          onSave={saveServerSettings}
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

