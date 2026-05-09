import { create } from "zustand";
import { getTheme } from "@shared/themes/registry";
import {
  clearPersistedThemeId,
  persistThemeId,
} from "@/storage/mobileThemePreferenceStorage";

export type MobileThemePreferenceState = {
  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  resetToDefault: () => void;
};

export const useMobileThemePreferenceStore = create<MobileThemePreferenceState>((set) => ({
  selectedThemeId: "default",
  setSelectedThemeId: (id) => {
    const normalized = getTheme(id).id;
    set({ selectedThemeId: normalized });
    void persistThemeId(normalized);
  },
  resetToDefault: () => {
    set({ selectedThemeId: "default" });
    void clearPersistedThemeId();
  },
}));
