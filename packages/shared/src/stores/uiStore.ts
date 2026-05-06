import { create } from "zustand";
import type { PendingUiConfirmation } from "@shared/app/types/types";

export type RenameServerDraft = {
  serverId: string;
  currentName: string;
};

export type RenameChannelDraft = {
  channelId: string;
  currentName: string;
};

export type RenameGroupDraft = {
  groupId: string;
  currentName: string;
};

export type CreateGroupDraft = {
  channelId: string | null;
};

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
  renameServerDraft: null as RenameServerDraft | null,
  renameChannelDraft: null as RenameChannelDraft | null,
  renameGroupDraft: null as RenameGroupDraft | null,
  createGroupDraft: null as CreateGroupDraft | null,
  pendingUiConfirmation: null as PendingUiConfirmation | null,
});

export type UiStoreState = ReturnType<typeof createDefaultUiState> & {
  setShowServerSettingsModal: (open: boolean) => void;
  setShowChannelSettingsModal: (open: boolean) => void;
  setChannelSettingsTargetId: (id: string | null) => void;
  setShowCreateModal: (open: boolean) => void;
  setShowCreateChannelModal: (open: boolean) => void;
  setShowJoinServerModal: (open: boolean) => void;
  setShowAccountModal: (open: boolean) => void;
  setShowVoiceSettingsModal: (open: boolean) => void;
  setUserVoiceHardwareTestOpen: (open: boolean) => void;
  setServerModmailOpen: (open: boolean) => void;
  setRenameServerDraft: (draft: RenameServerDraft | null) => void;
  setRenameChannelDraft: (draft: RenameChannelDraft | null) => void;
  setRenameGroupDraft: (draft: RenameGroupDraft | null) => void;
  setCreateGroupDraft: (draft: CreateGroupDraft | null) => void;
  setPendingUiConfirmation: (value: PendingUiConfirmation | null) => void;
  reset: () => void;
};

export const useUiStore = create<UiStoreState>()((set) => ({
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
  setRenameServerDraft: (renameServerDraft) => set({ renameServerDraft }),
  setRenameChannelDraft: (renameChannelDraft) => set({ renameChannelDraft }),
  setRenameGroupDraft: (renameGroupDraft) => set({ renameGroupDraft }),
  setCreateGroupDraft: (createGroupDraft) => set({ createGroupDraft }),
  setPendingUiConfirmation: (pendingUiConfirmation) =>
    set({ pendingUiConfirmation }),
  reset: () => set(createDefaultUiState()),
}));
