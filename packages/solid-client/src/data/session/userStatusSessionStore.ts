import { createStore } from "solid-js/store";
import type { UserStatusStoreState } from "@shared/core/sessionStorePorts";

/** Solid-native user status store stub — wired by Tauri host at bootstrap. */
export function createSolidUserStatusSessionStore() {
  const [state, setState] = createStore<UserStatusStoreState>({
    status: "online",
    rainbowMode: false,
    setStatus: (status) => setState("status", status),
    setRainbowMode: (rainbowMode) => setState("rainbowMode", rainbowMode),
  });

  return {
    getState: () => state,
    subscribe: () => () => {},
  };
}
