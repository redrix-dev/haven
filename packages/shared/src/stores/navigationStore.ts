import { create } from "zustand";

const createDefaultNavigationState = () => ({
  currentServerId: null as string | null,
  currentChannelId: null as string | null,
  workspaceMode: "community" as "community" | "dm",
});

export type NavigationStoreState = {
  currentServerId: string | null;
  currentChannelId: string | null;
  workspaceMode: "community" | "dm";

  setCurrentServerId: (id: string | null) => void;
  setCurrentChannelId: (id: string | null) => void;
  setWorkspaceMode: (mode: "community" | "dm") => void;
  clearNavigation: () => void;
};

export const useNavigationStore = create<NavigationStoreState>()((set) => ({
  ...createDefaultNavigationState(),
  setCurrentServerId: (currentServerId) => set({ currentServerId }),
  setCurrentChannelId: (currentChannelId) => set({ currentChannelId }),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  clearNavigation: () => set(createDefaultNavigationState()),
}));
