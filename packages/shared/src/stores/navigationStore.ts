import { create } from "zustand";
import type { ServerSummary } from "@shared/lib/backend/types";

const createDefaultNavigationState = () => ({
  currentServerId: null as string | null,
  currentServer: null as ServerSummary | null,
  currentChannelId: null as string | null,
  workspaceMode: "community" as "community" | "dm",
});

export type NavigationStoreState = {
  currentServerId: string | null;
  currentServer: ServerSummary | null;
  currentChannelId: string | null;
  workspaceMode: "community" | "dm";

  setCurrentServerId: (id: string | null) => void;
  setCurrentServer: (server: ServerSummary | null) => void;
  setCurrentChannelId: (id: string | null) => void;
  setWorkspaceMode: (mode: "community" | "dm") => void;
  clearNavigation: () => void;
};

export const useNavigationStore = create<NavigationStoreState>()((set) => ({
  ...createDefaultNavigationState(),
  setCurrentServerId: (currentServerId) => set({ currentServerId }),
  setCurrentServer: (currentServer) => set({ currentServer }),
  setCurrentChannelId: (currentChannelId) => set({ currentChannelId }),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  clearNavigation: () => set(createDefaultNavigationState()),
}));
