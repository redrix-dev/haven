import { useEffect } from "react";
import { installPromptTrap } from "@shared/infrastructure/contextMenu/debugTrace";
import { requireHavenCore } from "@shared/core";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useUiStore } from "@shared/stores/uiStore";

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
  useEffect(() => {
    installPromptTrap();
  }, []);

  useEffect(() => {
    if (serverModmailEnabled) return;
    useUiStore.getState().setServerModmailOpen(false);
  }, [serverModmailEnabled]);

  useEffect(() => {
    if (user) return;
    const core = requireHavenCore();
    core.communities.setActiveId(null);
    core.channels.setActiveChannelId(null);
    resetPlatformSession();
    resetVoiceState();
    setNotificationsPanelOpen(false);
    useUiStore.getState().reset();
    setFriendsPanelOpen(false);
    setWorkspaceMode("community");
    resetMessageState();
    clearAuthorProfileCache();
    clearCrossSessionMessagingCaches();
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
    clearAuthorProfileCache,
    clearCrossSessionMessagingCaches,
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
    resetSocialWorkspace,
    resetVoiceState,
    setFriendsPanelOpen,
    setNotificationsPanelOpen,
    setWorkspaceMode,
    user,
  ]);

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

  useEffect(() => {
    if (servers.length === 0 || !userId) return;
    const serverIds = servers.map((s) => s.id);
    void (async () => {
      await prefetchServersChannels(serverIds);
      await prefetchMessageCachesForServers(serverIds, prefetchChannelMessages);
    })();
  }, [
    servers,
    userId,
    prefetchServersChannels,
    prefetchMessageCachesForServers,
    prefetchChannelMessages,
  ]);
}
