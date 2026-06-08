import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type {
  UserStatus,
  UserStatusStoreState,
} from "@shared/core/sessionStorePorts";

export type { UserStatus, UserStatusStoreState } from "@shared/core/sessionStorePorts";

export const useUserStatusStore: UseBoundStore<StoreApi<UserStatusStoreState>> =
  create<UserStatusStoreState>()((set) => ({
    status: "online",
    rainbowMode: false,
    setStatus: (status) => set({ status }),
    setRainbowMode: (rainbowMode) => set({ rainbowMode }),
  }));
