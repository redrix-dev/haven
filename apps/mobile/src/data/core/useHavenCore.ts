import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { shallow } from "zustand/shallow";
import type {
  StoreName,
  StoreStates,
} from "@shared/collections/core/havenCore";
import { cachedSnapshot, subscribeStores, type Equal } from "./coreSnapshot";
import { requireHavenCore } from "./havenCoreRef";
import type { HavenReactCore } from "./HavenReactCore";

/**
 * The active HavenReactCore. The instance is made once at app start and
 * lives as long as the app; signing out empties it.
 */
export function useHavenCore(): HavenReactCore {
  return requireHavenCore();
}

/**
 * Reads across one or more stores and re-renders only when the result
 * changes. `select` gets the named stores' current states; the result is
 * compared with `equal` (shallow by default, so a new array holding the same
 * rows counts as unchanged).
 *
 * `names` must stay the same for the life of the component.
 *
 *   const name = useCore(["members", "profiles"], (s) =>
 *     displayName(s.members, s.profiles, communityId, userId));
 */
export function useCore<N extends StoreName, T>(
  names: readonly N[],
  select: (states: Pick<StoreStates, N>) => T,
  equal: Equal<T> = shallow,
): T {
  const core = useHavenCore();
  const current = useRef({ select, equal });
  current.current = { select, equal };

  // `names` is fixed per call site, so both live as long as the component.
  const subscribe = useCallback(
    (listener: () => void) => subscribeStores(core.stores, names, listener),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core],
  );
  const getSnapshot = useMemo(
    () => cachedSnapshot(core.stores, names, () => current.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** `useCore` over one store. */
export function useStore<N extends StoreName, T>(
  name: N,
  select: (state: StoreStates[N]) => T,
  equal: Equal<T> = shallow,
): T {
  return useCore([name], (states) => select(states[name]), equal);
}

/** The voice call's whole state. Re-renders on any voice change. */
export function useVoiceSession(): StoreStates["voice"] {
  return useStore("voice", (state) => state, Object.is);
}

/** The signed-in person's id, or null. */
export function useMe(): string | null {
  return useStore("core", (state) => state.userId);
}

/** What to call someone, kept current as nicknames and profiles change. */
export function useNameOf(userId: string, communityId?: string | null): string {
  const core = useHavenCore();
  return useCore(["members", "profiles"], () =>
    core.nameOf(userId, communityId),
  );
}

/** Where someone's picture is, kept current as their profile changes. */
export function useAvatarUrl(userId: string | null | undefined): string | null {
  const core = useHavenCore();
  return useStore("profiles", () => (userId ? core.avatarUrl(userId) : null));
}
