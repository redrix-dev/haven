import { createStore } from "solid-js/store";
import type { AuthStoreState } from "@shared/core/sessionStorePorts";

/** Solid-native auth session store stub — wired by Tauri host at bootstrap. */
export function createSolidAuthSessionStore() {
  const [state, setState] = createStore<AuthStoreState>({
    user: null,
    session: null,
    isLoading: true,
    setUser: (user) => setState("user", user),
    setSession: (session) => setState("session", session),
    setIsLoading: (isLoading) => setState("isLoading", isLoading),
  });

  return {
    getState: () => state,
    subscribe: () => () => {},
  };
}
