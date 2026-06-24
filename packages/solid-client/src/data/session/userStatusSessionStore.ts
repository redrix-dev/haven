import { createStore } from "solid-js/store";
import type { UserStatusStoreState } from "@shared/core/sessionStorePorts";

/**
 * Solid-native user status store. `getState()` returns the live store proxy;
 * read its fields in a tracking scope to react. No subscribe.
 */
export function createSolidUserStatusSessionStore() {
  const [state, setState] = createStore<UserStatusStoreState>({
    status: "online",
    rainbowMode: false,
    setStatus: (status) => setState("status", status),
    setRainbowMode: (rainbowMode) => setState("rainbowMode", rainbowMode),
  });

  return { getState: () => state };
}
