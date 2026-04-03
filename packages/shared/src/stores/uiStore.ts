import { create } from 'zustand';

const createDefaultUiState = () => ({
  showServerSettingsModal: false,
  showChannelSettingsModal: false,
  channelSettingsTargetId: null as string | null,
});

export type UiStoreState = {
  showServerSettingsModal: boolean;
  showChannelSettingsModal: boolean;
  channelSettingsTargetId: string | null;
  setShowServerSettingsModal: (open: boolean) => void;
  setShowChannelSettingsModal: (open: boolean) => void;
  setChannelSettingsTargetId: (id: string | null) => void;
  reset: () => void;
};

export const useUiStore = create<UiStoreState>()((set) => ({
  ...createDefaultUiState(),
  setShowServerSettingsModal: (showServerSettingsModal) => set({ showServerSettingsModal }),
  setShowChannelSettingsModal: (showChannelSettingsModal) => set({ showChannelSettingsModal }),
  setChannelSettingsTargetId: (channelSettingsTargetId) => set({ channelSettingsTargetId }),
  reset: () => set(createDefaultUiState()),
}));