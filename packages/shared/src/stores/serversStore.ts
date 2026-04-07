import { create } from "zustand";
import type { ServerSummary } from "@shared/lib/backend/types";

const createDefaultServersState = () => ({
  servers: [] as ServerSummary[],
  isLoading: false,
});

export type ServersStoreState = {
  servers: ServerSummary[];
  isLoading: boolean;
  setServers: (servers: ServerSummary[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
};

export const useServersStore = create<ServersStoreState>()((set) => ({
  ...createDefaultServersState(),
  setServers: (servers) => set({ servers }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(createDefaultServersState()),
}));
