import { useEffect } from "react";
import { installPromptTrap } from "@shared/lib/contextMenu/debugTrace";
import { useNavigationStore } from "@shared/stores/navigationStore";
import { usePermissionsStore } from "@shared/stores/permissionsStore";
import { useUiStore } from "@shared/stores/uiStore";

type UseChatAppLifecycleEffectsInput = {
  user: unknown | null;
  serverModmailEnabled: boolean;
  currentServerId: string | null;
  userId: string | undefined;
  currentServerIdForPrefetch: string | null;
  servers: { id: string }[];
  setNotificationsPanelOpen: (open: boolean) => void;
  setFriendsPanelOpen: (open: boolean) => void;
  setWorkspaceMode: (mode: "community" | "dm") => void;
  resetPlatformSession: () => void;
  resetVoiceState: () => void;
  resetMessageState: () => void;
  clearAuthorProfileCache: () => void;
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
  getDefaultChannelIdForServer: (
    serverId: string,
    lastVisited?: string | null,
  ) => string | null;
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
  currentServerIdForPrefetch,
  servers,
  setNotificationsPanelOpen,
  setFriendsPanelOpen,
  setWorkspaceMode,
  resetPlatformSession,
  resetVoiceState,
  resetMessageState,
  clearAuthorProfileCache,
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
  getDefaultChannelIdForServer,
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
    useNavigationStore.getState().clearNavigation();
    resetPlatformSession();
    resetVoiceState();
    setNotificationsPanelOpen(false);
    useUiStore.getState().reset();
    setFriendsPanelOpen(false);
    setWorkspaceMode("community");
    resetMessageState();
    clearAuthorProfileCache();
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
      await Promise.allSettled(
        serverIds
          .filter((id) => id !== currentServerIdForPrefetch)
          .map((id) => {
            const defaultChannelId = getDefaultChannelIdForServer(id);
            if (!defaultChannelId) return Promise.resolve();
            return prefetchChannelMessages(id, defaultChannelId);
          }),
      );
    })();
  }, [
    servers,
    userId,
    currentServerIdForPrefetch,
    prefetchServersChannels,
    getDefaultChannelIdForServer,
    prefetchChannelMessages,
  ]);
}
