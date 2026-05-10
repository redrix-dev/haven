import { create } from "zustand";
import {
  clearPersistedThemeId,
  persistThemeId,
} from "@/storage/mobileThemePreferenceStorage";
import { normalizeMobileThemeId } from "@/lib/theme";

export type MobileThemePreferenceState = {
  selectedThemeId: ReturnType<typeof normalizeMobileThemeId>;
  setSelectedThemeId: (id: string) => void;
  resetToDefault: () => void;
};

export const useMobileThemePreferenceStore = create<MobileThemePreferenceState>((set) => ({
  selectedThemeId: "default",
  setSelectedThemeId: (id) => {
    const normalized = normalizeMobileThemeId(id);
    set({ selectedThemeId: normalized });
    void persistThemeId(normalized);
  },
  resetToDefault: () => {
    set({ selectedThemeId: "default" });
    void clearPersistedThemeId();
  },
}));
