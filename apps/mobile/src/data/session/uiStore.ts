import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type {
  CreateGroupDraft,
  RenameChannelDraft,
  RenameGroupDraft,
  RenameServerDraft,
  UiStoreState,
  WorkspaceMode,
  CommunitySettingsTab,
} from "@shared/core/sessionStorePorts";
import type { PendingUiConfirmation } from "@shared/types/types";

export type {
  CreateGroupDraft,
  RenameChannelDraft,
  RenameGroupDraft,
  RenameServerDraft,
  UiStoreState,
  WorkspaceMode,
} from "@shared/core/sessionStorePorts";

const createDefaultUiState = () => ({
  showServerSettingsModal: false,
  showChannelSettingsModal: false,
  channelSettingsTargetId: null as string | null,
  showCreateModal: false,
  showCreateChannelModal: false,
  showJoinServerModal: false,
  showAccountModal: false,
  showVoiceSettingsModal: false,
  userVoiceHardwareTestOpen: false,
  serverModmailOpen: false,
  serverSettingsTab: null as CommunitySettingsTab | null,
  renameServerDraft: null as RenameServerDraft | null,
  renameChannelDraft: null as RenameChannelDraft | null,
  renameGroupDraft: null as RenameGroupDraft | null,
  createGroupDraft: null as CreateGroupDraft | null,
  pendingUiConfirmation: null as PendingUiConfirmation | null,
  workspaceMode: "community" as WorkspaceMode,
  showHiddenMessages: false,
  friendsPanelOpen: false,
  friendsPanelRequestedTab: null as
    | import("@shared/types/types").FriendsPanelTab
    | null,
  friendsPanelHighlightedRequestId: null as string | null,
  notificationsPanelOpen: false,
});

export const useUiStore: UseBoundStore<StoreApi<UiStoreState>> =
  create<UiStoreState>()((set) => ({
    ...createDefaultUiState(),
    setShowServerSettingsModal: (showServerSettingsModal) =>
      set({ showServerSettingsModal }),
    setShowChannelSettingsModal: (showChannelSettingsModal) =>
      set({ showChannelSettingsModal }),
    setChannelSettingsTargetId: (channelSettingsTargetId) =>
      set({ channelSettingsTargetId }),
    setShowCreateModal: (showCreateModal) => set({ showCreateModal }),
    setShowCreateChannelModal: (showCreateChannelModal) =>
      set({ showCreateChannelModal }),
    setShowJoinServerModal: (showJoinServerModal) =>
      set({ showJoinServerModal }),
    setShowAccountModal: (showAccountModal) => set({ showAccountModal }),
    setShowVoiceSettingsModal: (showVoiceSettingsModal) =>
      set({ showVoiceSettingsModal }),
    setUserVoiceHardwareTestOpen: (userVoiceHardwareTestOpen) =>
      set({ userVoiceHardwareTestOpen }),
    setServerModmailOpen: (serverModmailOpen) => set({ serverModmailOpen }),
    setServerSettingsTab: (serverSettingsTab) => set({ serverSettingsTab }),
    setRenameServerDraft: (renameServerDraft) => set({ renameServerDraft }),
    setRenameChannelDraft: (renameChannelDraft) => set({ renameChannelDraft }),
    setRenameGroupDraft: (renameGroupDraft) => set({ renameGroupDraft }),
    setCreateGroupDraft: (createGroupDraft) => set({ createGroupDraft }),
    setPendingUiConfirmation: (pendingUiConfirmation) =>
      set({ pendingUiConfirmation }),
    setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
    setShowHiddenMessages: (showHiddenMessages) => set({ showHiddenMessages }),
    setFriendsPanelOpen: (friendsPanelOpen) => set({ friendsPanelOpen }),
    setFriendsPanelRequestedTab: (friendsPanelRequestedTab) =>
      set({ friendsPanelRequestedTab }),
    setFriendsPanelHighlightedRequestId: (friendsPanelHighlightedRequestId) =>
      set({ friendsPanelHighlightedRequestId }),
    setNotificationsPanelOpen: (notificationsPanelOpen) =>
      set({ notificationsPanelOpen }),
    reset: () => set(createDefaultUiState()),
  }));
