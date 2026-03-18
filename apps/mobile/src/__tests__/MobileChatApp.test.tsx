// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileChatApp } from '@mobile/mobile/MobileChatApp';

const mobileChatAppMocks = vi.hoisted(() => ({
  useChatAppOrchestration: vi.fn(),
  useMobileViewport: vi.fn(),
  useServerOrder: vi.fn(),
}));

vi.mock('@client/app/hooks/useChatAppOrchestration', () => ({
  useChatAppOrchestration: mobileChatAppMocks.useChatAppOrchestration,
}));

vi.mock('@mobile/mobile/MobileLoginScreen', () => ({
  MobileLoginScreen: () => <div>Mobile Login</div>,
}));

vi.mock('@mobile/mobile/MobilePasswordRecoverySheet', () => ({
  MobilePasswordRecoverySheet: () => null,
}));

vi.mock('@shared/components/CreateServerModal', () => ({
  CreateServerModal: () => null,
}));

vi.mock('@shared/components/JoinServerModal', () => ({
  JoinServerModal: () => null,
}));

vi.mock('@mobile/mobile/MobileAccountSettingsSheet', () => ({
  MobileAccountSettingsSheet: () => null,
}));

vi.mock('@mobile/mobile/MobileServerSettingsSheet', () => ({
  MobileServerSettingsSheet: () => null,
}));

vi.mock('@mobile/mobile/MobileChannelSettingsSheet', () => ({
  MobileChannelSettingsSheet: () => null,
}));

vi.mock('@mobile/mobile/MobileSplashScreen', () => ({
  MobileSplashScreen: () => <div>Splash</div>,
}));

vi.mock('@mobile/mobile/MobileServerSubHeader', () => ({
  MobileServerSubHeader: () => null,
}));

vi.mock('@mobile/mobile/MobileServerDrawer', () => ({
  MobileServerDrawer: () => null,
}));

vi.mock('@mobile/mobile/MobileServerGrid', () => ({
  MobileServerGrid: () => <div>Server Grid</div>,
}));

vi.mock('@mobile/mobile/MobileChannelSubHeader', () => ({
  MobileChannelSubHeader: () => null,
}));

vi.mock('@mobile/mobile/MobileChannelDrawer', () => ({
  MobileChannelDrawer: () => null,
}));

vi.mock('@mobile/mobile/MobileChannelView', () => ({
  MobileChannelView: () => null,
}));

vi.mock('@mobile/mobile/MobileDmInbox', () => ({
  MobileDmInbox: () => null,
}));

vi.mock('@mobile/mobile/MobileDmConversationView', () => ({
  MobileDmConversationView: () => null,
}));

vi.mock('@mobile/mobile/MobileNotificationsView', () => ({
  MobileNotificationsView: () => null,
}));

vi.mock('@mobile/mobile/MobileNotificationSettingsSheet', () => ({
  MobileNotificationSettingsSheet: () => null,
}));

vi.mock('@mobile/mobile/MobileFriendsSheet', () => ({
  MobileFriendsSheet: () => null,
}));

vi.mock('@mobile/mobile/MobileVoiceSettingsSheet', () => ({
  MobileVoiceSettingsSheet: () => null,
}));

vi.mock('@mobile/mobile/layout/MobileViewportContext', async () => {
  const actual = await vi.importActual<typeof import('@mobile/mobile/layout/MobileViewportContext')>(
    '@mobile/mobile/layout/MobileViewportContext'
  );

  return {
    ...actual,
    useMobileViewport: mobileChatAppMocks.useMobileViewport,
  };
});

vi.mock('@client/features/community/hooks/useServerOrder', () => ({
  useServerOrder: mobileChatAppMocks.useServerOrder,
}));

function createAppMock() {
  const asyncNoop = vi.fn().mockResolvedValue(undefined);

  return {
    authStatus: 'authenticated',
    authError: null,
    user: { id: 'user-1', email: 'user@example.com' },
    passwordRecoveryRequired: false,
    isServersLoading: false,
    servers: [{ id: 'server-1', name: 'Alpha' }],
    currentServerId: null,
    currentServer: null,
    channels: [],
    channelsLoading: false,
    currentChannel: null,
    currentChannelId: null,
    channelSettingsTarget: null,
    channelGroupState: { groups: [], collapsedGroupIds: [], ungroupedChannelIds: [] },
    sidebarChannelGroups: [],
    messages: [],
    messageReactions: [],
    messageLinkPreviews: [],
    authorProfiles: {},
    hasOlderMessages: false,
    isLoadingOlderMessages: false,
    notificationItems: [],
    notificationCounts: { unseenCount: 0, unreadCount: 0 },
    notificationsLoading: false,
    notificationsRefreshing: false,
    notificationsError: null,
    notificationPreferences: null,
    notificationPreferencesLoading: false,
    notificationPreferencesSaving: false,
    notificationPreferencesError: null,
    socialCounts: {
      friendsCount: 0,
      incomingPendingRequestCount: 0,
      outgoingPendingRequestCount: 0,
      blockedUserCount: 0,
    },
    dmConversations: [],
    dmConversationsLoading: false,
    dmConversationsError: null,
    profileUsername: 'User',
    profileAvatarUrl: null,
    userDisplayName: 'User',
    baseUserDisplayName: 'User',
    selectedDmConversationId: null,
    friendsSocialPanelEnabled: false,
    friendsPanelOpen: false,
    friendsPanelRequestedTab: null,
    friendsPanelHighlightedRequestId: null,
    showCreateModal: false,
    showJoinServerModal: false,
    showServerSettingsModal: false,
    showChannelSettingsModal: false,
    showAccountModal: false,
    canOpenServerSettings: false,
    canManageCurrentServer: false,
    voiceSettingsSaving: false,
    voiceSettingsError: null,
    webPushStatus: null,
    webPushStatusLoading: false,
    webPushActionBusy: false,
    webPushStatusError: null,
    appSettingsLoading: false,
    updaterStatus: null,
    updaterStatusLoading: false,
    checkingForUpdates: false,
    serverSettingsInitialValues: null,
    serverSettingsLoading: false,
    serverSettingsLoadError: null,
    serverRoles: [],
    serverMembers: [],
    serverPermissionCatalog: [],
    serverRoleManagementLoading: false,
    serverRoleManagementError: null,
    serverInvites: [],
    serverInvitesLoading: false,
    serverInvitesError: null,
    communityBans: [],
    communityBansLoading: false,
    communityBansError: null,
    appSettings: {
      autoUpdateEnabled: true,
      notifications: {
        masterSoundEnabled: true,
        notificationSoundVolume: 70,
        voicePresenceSoundEnabled: true,
        voicePresenceSoundVolume: 70,
        playSoundsWhenFocused: true,
      },
      voice: {
        preferredInputDeviceId: 'default',
        preferredOutputDeviceId: 'default',
        transmissionMode: 'voice_activity',
        voiceActivationThreshold: 18,
        pushToTalkBinding: {
          code: 'F13',
          key: 'F13',
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          label: 'F13',
        },
      },
    },
    serverPermissions: {
      canManageChannelStructure: false,
      canManageChannelPermissions: false,
      canManageMessages: false,
      canManageServer: false,
      canManageRoles: false,
      canManageMembers: false,
      canManageBans: false,
      isOwner: false,
      canManageDeveloperAccess: false,
      canManageInvites: false,
    },
    setWorkspaceMode: vi.fn(),
    setCurrentServerId: vi.fn(),
    setCurrentChannelId: vi.fn(),
    setShowCreateModal: vi.fn(),
    setShowJoinServerModal: vi.fn(),
    setShowServerSettingsModal: vi.fn(),
    setShowChannelSettingsModal: vi.fn(),
    setChannelSettingsTargetId: vi.fn(),
    setShowAccountModal: vi.fn(),
    setShowVoiceSettingsModal: vi.fn(),
    setFriendsPanelOpen: vi.fn(),
    setFriendsPanelRequestedTab: vi.fn(),
    setFriendsPanelHighlightedRequestId: vi.fn(),
    setNotificationRouteSimulationFocus: vi.fn(),
    setWebPushNotificationDevMode: vi.fn(),
    setVoiceSettings: vi.fn(),
    setAutoUpdateEnabled: asyncNoop,
    setShowCreateChannelModal: vi.fn(),
    createServer: asyncNoop,
    joinServerByInvite: vi.fn().mockResolvedValue({ communityName: 'Alpha', joined: true }),
    refreshWebPushStatus: asyncNoop,
    refreshDmConversations: asyncNoop,
    openDirectMessageConversation: asyncNoop,
    directMessageUser: asyncNoop,
    requestOlderMessages: vi.fn(),
    sendMessage: asyncNoop,
    editMessage: asyncNoop,
    deleteMessage: asyncNoop,
    markAllNotificationsSeen: vi.fn(),
    markNotificationRead: vi.fn(),
    dismissNotification: vi.fn(),
    acceptFriendRequestFromNotification: asyncNoop,
    declineFriendRequestFromNotification: asyncNoop,
    openNotificationItem: vi.fn(),
    refreshNotificationsManually: vi.fn(),
    openServerSettingsModal: asyncNoop,
    saveServerSettings: asyncNoop,
    createServerRole: asyncNoop,
    updateServerRole: asyncNoop,
    deleteServerRole: asyncNoop,
    saveServerRolePermissions: asyncNoop,
    saveServerMemberRoles: asyncNoop,
    createServerInvite: asyncNoop,
    revokeServerInvite: asyncNoop,
    unbanUserFromCurrentServer: asyncNoop,
    getPlatformInviteBaseUrl: vi.fn(() => 'https://example.com/invite'),
    saveAccountSettings: asyncNoop,
    checkForUpdatesNow: asyncNoop,
    signOut: asyncNoop,
    deleteAccount: asyncNoop,
    saveNotificationPreferences: asyncNoop,
    enableWebPushOnThisDevice: asyncNoop,
    disableWebPushOnThisDevice: asyncNoop,
    completePasswordRecovery: asyncNoop,
  };
}

describe('MobileChatApp', () => {
  beforeEach(() => {
    const appMock = createAppMock();

    mobileChatAppMocks.useChatAppOrchestration.mockReturnValue(appMock);
    mobileChatAppMocks.useMobileViewport.mockReturnValue({
      hasFocusedTextEntry: false,
      keyboardInsetPx: 0,
      keyboardOpen: false,
      layoutViewportHeightPx: 812,
      scale: 1,
      shellHeightPx: 812,
      visualViewportHeightPx: 812,
      visualViewportOffsetTopPx: 0,
    });
    mobileChatAppMocks.useServerOrder.mockReturnValue({
      orderedServers: appMock.servers,
      setOrder: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes account settings in the header and removes the old home footer dock', () => {
    render(<MobileChatApp />);

    expect(screen.getByRole('button', { name: /account settings/i })).toBeTruthy();
    expect(screen.queryByText('Account & Settings')).toBeNull();
  });

  it('renders the mobile login screen for unauthenticated users', () => {
    const appMock = createAppMock() as any;
    appMock.user = null;
    appMock.authStatus = 'unauthenticated';
    mobileChatAppMocks.useChatAppOrchestration.mockReturnValue(appMock);

    render(<MobileChatApp />);

    expect(screen.getByText('Mobile Login')).toBeTruthy();
  });
});
