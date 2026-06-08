import React from "react";
import { useHavenCore } from "@shared/core";
import { useActiveChannelId } from "@react-bindings";
import { useUiStore } from "@shared/stores/uiStore";
import { getPendingUiConfirmationCopy } from "@web-client/ui-confirmations";

export function useChatAppModalUiState() {
  const core = useHavenCore();
  const currentServerId = core.communities.useActiveId();
  const currentChannelId = useActiveChannelId(core.channels);
  const channelSettingsTargetId = useUiStore(
    (state) => state.channelSettingsTargetId,
  );
  const serverPermissions = core.permissions.usePermissions(currentServerId ?? "");
  const serverPermissionsById = core.permissions.usePermissionsByCommunityId();
  const notificationsPanelOpen = useUiStore(
    (state) => state.notificationsPanelOpen,
  );
  const setNotificationsPanelOpen = useUiStore(
    (state) => state.setNotificationsPanelOpen,
  );

  const showCreateModal = useUiStore((state) => state.showCreateModal);
  const setShowCreateModal = useUiStore((state) => state.setShowCreateModal);
  const showCreateChannelModal = useUiStore(
    (state) => state.showCreateChannelModal,
  );
  const setShowCreateChannelModal = useUiStore(
    (state) => state.setShowCreateChannelModal,
  );
  const showJoinServerModal = useUiStore((state) => state.showJoinServerModal);
  const setShowJoinServerModal = useUiStore(
    (state) => state.setShowJoinServerModal,
  );
  const showServerSettingsModal = useUiStore(
    (state) => state.showServerSettingsModal,
  );
  const setShowServerSettingsModal = useUiStore(
    (state) => state.setShowServerSettingsModal,
  );
  const showChannelSettingsModal = useUiStore(
    (state) => state.showChannelSettingsModal,
  );
  const setShowChannelSettingsModal = useUiStore(
    (state) => state.setShowChannelSettingsModal,
  );
  const setChannelSettingsTargetId = useUiStore(
    (state) => state.setChannelSettingsTargetId,
  );
  const showAccountModal = useUiStore((state) => state.showAccountModal);
  const setShowAccountModal = useUiStore((state) => state.setShowAccountModal);
  const showVoiceSettingsModal = useUiStore(
    (state) => state.showVoiceSettingsModal,
  );
  const setShowVoiceSettingsModal = useUiStore(
    (state) => state.setShowVoiceSettingsModal,
  );
  const userVoiceHardwareTestOpen = useUiStore(
    (state) => state.userVoiceHardwareTestOpen,
  );
  const setUserVoiceHardwareTestOpen = useUiStore(
    (state) => state.setUserVoiceHardwareTestOpen,
  );
  const serverModmailOpen = useUiStore((state) => state.serverModmailOpen);
  const setServerModmailOpen = useUiStore(
    (state) => state.setServerModmailOpen,
  );
  const pendingUiConfirmation = useUiStore(
    (state) => state.pendingUiConfirmation,
  );
  const setPendingUiConfirmation = useUiStore(
    (state) => state.setPendingUiConfirmation,
  );
  const pendingUiConfirmationCopy = React.useMemo(
    () => getPendingUiConfirmationCopy(pendingUiConfirmation),
    [pendingUiConfirmation],
  );
  const renameServerDraft = useUiStore((state) => state.renameServerDraft);
  const setRenameServerDraft = useUiStore((state) => state.setRenameServerDraft);
  const renameChannelDraft = useUiStore((state) => state.renameChannelDraft);
  const setRenameChannelDraft = useUiStore(
    (state) => state.setRenameChannelDraft,
  );
  const renameGroupDraft = useUiStore((state) => state.renameGroupDraft);
  const setRenameGroupDraft = useUiStore((state) => state.setRenameGroupDraft);
  const createGroupDraft = useUiStore((state) => state.createGroupDraft);
  const setCreateGroupDraft = useUiStore((state) => state.setCreateGroupDraft);

  const canManageChannelStructure = serverPermissions.canManageChannelStructure;
  const canManageChannelPermissions =
    serverPermissions.canManageChannelPermissions;
  const canOpenChannelSettings =
    canManageChannelStructure || canManageChannelPermissions;

  return {
    currentServerId,
    currentChannelId,
    channelSettingsTargetId,
    serverPermissions,
    serverPermissionsById,
    notificationsPanelOpen,
    setNotificationsPanelOpen,
    showCreateModal,
    setShowCreateModal,
    showCreateChannelModal,
    setShowCreateChannelModal,
    showJoinServerModal,
    setShowJoinServerModal,
    showServerSettingsModal,
    setShowServerSettingsModal,
    showChannelSettingsModal,
    setShowChannelSettingsModal,
    setChannelSettingsTargetId,
    showAccountModal,
    setShowAccountModal,
    showVoiceSettingsModal,
    setShowVoiceSettingsModal,
    userVoiceHardwareTestOpen,
    setUserVoiceHardwareTestOpen,
    serverModmailOpen,
    setServerModmailOpen,
    pendingUiConfirmation,
    setPendingUiConfirmation,
    pendingUiConfirmationCopy,
    renameServerDraft,
    setRenameServerDraft,
    renameChannelDraft,
    setRenameChannelDraft,
    renameGroupDraft,
    setRenameGroupDraft,
    createGroupDraft,
    setCreateGroupDraft,
    canManageChannelStructure,
    canManageChannelPermissions,
    canOpenChannelSettings,
  };
}

export type ChatAppModalUiState = ReturnType<typeof useChatAppModalUiState>;
