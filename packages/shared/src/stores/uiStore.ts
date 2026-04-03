import { create } from 'zustand';

const createDefaultUiState = () => ({
  showServerSettingsModal: false,
  showChannelSettingsModal: false,
});

export type UiStoreState = {
  showServerSettingsModal: boolean;
  showChannelSettingsModal: boolean;
  setShowServerSettingsModal: (open: boolean) => void;
  setShowChannelSettingsModal: (open: boolean) => void;
  reset: () => void;
};

export const useUiStore = create<UiStoreState>()((set) => ({
  ...createDefaultUiState(),
  setShowServerSettingsModal: (showServerSettingsModal) => set({ showServerSettingsModal }),
  setShowChannelSettingsModal: (showChannelSettingsModal) => set({ showChannelSettingsModal }),
  reset: () => set(createDefaultUiState()),
}));