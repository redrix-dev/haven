import { MESSAGE_RELOAD_FRESHNESS_WINDOW_MS } from "./constants";

export function shouldSkipInitialReload(input: {
  initialLoadComplete: boolean;
  lastInitialLoadedAt: number;
  freshnessMs?: number;
  now?: number;
}): boolean {
  const freshnessMs =
    input.freshnessMs ?? MESSAGE_RELOAD_FRESHNESS_WINDOW_MS;
  const now = input.now ?? Date.now();
  return (
    input.initialLoadComplete && now - input.lastInitialLoadedAt < freshnessMs
  );
}
