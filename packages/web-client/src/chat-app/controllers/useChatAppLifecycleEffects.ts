import { useEffect, useMemo, useRef } from "react";
import { installPromptTrap } from "@shared/infrastructure/contextMenu/debugTrace";
import { requireHavenCore } from "@shared/core";
import { useUiStore } from "@mobile-data/session/uiStore";

type UseChatAppLifecycleEffectsInput = {
  user: unknown | null;
  serverModmailEnabled: boolean;
  currentServerId: string | null;
  userId: string | undefined;
  servers: { id: string }[];
  setNotificationsPanelOpen: (open: boolean) => void;
  setFriendsPanelOpen: (open: boolean) => void;
  setWorkspaceMode: (mode: "community" | "dm") => void;
  resetPlatformSession: () => void;
  resetVoiceState: () => void;
  resetMessageState: () => void;
  clearAuthorProfileCache: () => void;
  clearCrossSessionMessagingCaches: () => void;
  resetFeatureFlags: () => void;
  resetNotifications: () => void;
  resetSocialWorkspace: () => void;
  resetDirectMessages: () => void;
  resetChannelsWorkspace: () => void;
  resetServerSettingsState: () => void;
  resetServerInvites: () => void;
  resetServerRoleManagement: () => void;
  resetChannelPermissionsState: () => void;
  resetChannelGroups: () => void;
  resetMembersModal: () => void;
  resetCommunityBans: () => void;
  prefetchServersChannels: (serverIds: string[]) => Promise<void>;
  prefetchMessageCachesForServers: (
    serverIds: string[],
    prefetchChannelMessages: (serverId: string, channelId: string) => Promise<void>,
  ) => Promise<void>;
  prefetchChannelMessages: (
    serverId: string,
    channelId: string,
  ) => Promise<void>;
};

export function useChatAppLifecycleEffects({
  user,
  serverModmailEnabled,
  currentServerId,
  userId,
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
}: UseChatAppLifecycleEffectsInput) {
  const actionsRef = useRef({
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
  actionsRef.current = {
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
  };

  const serverIdsKey = useMemo(
    () => servers.map((server) => server.id).sort().join(","),
    [servers],
  );

  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (serverModmailEnabled) return;
    useUiStore.getState().setServerModmailOpen(false);
  }, [serverModmailEnabled]);

  useEffect(() => {
    if (user) return;
    const actions = actionsRef.current;
    const core = requireHavenCore();
    core.communities.setActiveId(null);
    core.channels.setActiveChannelId(null);
    actions.resetPlatformSession();
    actions.resetVoiceState();
    actions.setNotificationsPanelOpen(false);
    useUiStore.getState().reset();
    actions.setFriendsPanelOpen(false);
    actions.setWorkspaceMode("community");
    actions.resetMessageState();
    actions.clearAuthorProfileCache();
    actions.clearCrossSessionMessagingCaches();
    actions.resetFeatureFlags();
    actions.resetNotifications();
    actions.resetSocialWorkspace();
    actions.resetDirectMessages();
    actions.resetChannelsWorkspace();
    requireHavenCore().permissions.clear();
    actions.resetServerSettingsState();
    actions.resetServerInvites();
    actions.resetServerRoleManagement();
    actions.resetChannelPermissionsState();
    actions.resetChannelGroups();
    actions.resetMembersModal();
    actions.resetCommunityBans();
  }, [user]);

  useEffect(() => {
    if (currentServerId) return;
    const actions = actionsRef.current;
    actions.resetChannelsWorkspace();
    actions.resetVoiceState();
    actions.resetMessageState();
    useUiStore.getState().setShowCreateChannelModal(false);
    useUiStore.getState().setShowJoinServerModal(false);
    useUiStore.getState().setShowServerSettingsModal(false);
    useUiStore.getState().setShowChannelSettingsModal(false);
    useUiStore.getState().setChannelSettingsTargetId(null);
    actions.resetServerSettingsState();
    actions.resetServerInvites();
    actions.resetServerRoleManagement();
    actions.resetChannelPermissionsState();
    actions.resetChannelGroups();
    actions.resetMembersModal();
    useUiStore.getState().setRenameChannelDraft(null);
    useUiStore.getState().setRenameGroupDraft(null);
    useUiStore.getState().setCreateGroupDraft(null);
    actions.resetCommunityBans();
  }, [currentServerId]);

  useEffect(() => {
    if (!userId || serverIdsKey.length === 0) return;
    const serverIds = serverIdsKey.split(",");
    const actions = actionsRef.current;
    void (async () => {
      await actions.prefetchServersChannels(serverIds);
      await actions.prefetchMessageCachesForServers(
        serverIds,
        actions.prefetchChannelMessages,
      );
    })();
  }, [serverIdsKey, userId]);
}
