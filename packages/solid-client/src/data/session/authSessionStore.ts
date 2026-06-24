import { createStore } from "solid-js/store";
import type { AuthStoreState } from "@shared/core/sessionStorePorts";

/**
 * Solid-native auth session store. `getState()` returns the live store proxy;
 * read its fields in a tracking scope to react to auth changes. No subscribe —
 * the proxy is the reactive source.
 */
export function createSolidAuthSessionStore() {
  const [state, setState] = createStore<AuthStoreState>({
    user: null,
    session: null,
    isLoading: true,
    setUser: (user) => setState("user", user),
    setSession: (session) => setState("session", session),
    setIsLoading: (isLoading) => setState("isLoading", isLoading),
  });

  return { getState: () => state };
}
