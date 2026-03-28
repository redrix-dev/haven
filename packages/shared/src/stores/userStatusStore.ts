import { create } from "zustand";

export type UserStatus = "online" | "away" | "dnd";
export type RainbowMode = boolean;

export type UserStatusStoreState = {
  status: UserStatus;
  setStatus: (status: UserStatus) => void;
  rainbowMode: boolean;
  setRainbowMode: (rainbowMode: boolean) => void;
};

export const useUserStatusStore = create<UserStatusStoreState>()((set) => ({
  status: "online",
  rainbowMode: false,
  setStatus: (status) => set({ status }),
  setRainbowMode: (rainbowMode) => set({ rainbowMode }),
}));
