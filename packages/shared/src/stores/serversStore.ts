import { create } from 'zustand';
import type { ServerSummary } from '@shared/lib/backend/types';

const createDefaultServersState = () => ({
  servers: [] as ServerSummary[],
  currentServerId: null as string | null,
  currentServer: null as ServerSummary | null,
  isLoading: false,
});

export type ServersStoreState = {
  servers: ServerSummary[];
  currentServerId: string | null;
  currentServer: ServerSummary | null;
  isLoading: boolean;
  setServers: (servers: ServerSummary[]) => void;
  setCurrentServerId: (currentServerId: string | null) => void;
  setCurrentServer: (currentServer: ServerSummary | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  reset: () => void;
};

export const useServersStore = create<ServersStoreState>()((set) => ({
  ...createDefaultServersState(),
  setServers: (servers) => set({ servers }),
  setCurrentServerId: (currentServerId) => set({ currentServerId }),
  setCurrentServer: (currentServer) => set({ currentServer }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(createDefaultServersState()),
}));
