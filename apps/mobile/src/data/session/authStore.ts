import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type { AuthStoreState } from "@shared/core/sessionStorePorts";

export type { AuthStoreState } from "@shared/core/sessionStorePorts";

export const useAuthStore: UseBoundStore<StoreApi<AuthStoreState>> =
  create<AuthStoreState>()((set) => ({
    user: null,
    session: null,
    isLoading: true,
    setUser: (user) => set({ user }),
    setSession: (session) => set({ session }),
    setIsLoading: (isLoading) => set({ isLoading }),
  }));
