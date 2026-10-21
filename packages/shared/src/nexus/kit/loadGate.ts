/**
 * One load per key at a time. A second `run` for a key that is already in
 * flight gets the same promise instead of firing a second request, so rapid
 * navigation or overlapping triggers cost one round trip and one state write.
 *
 * This replaces the hand-written `loadInflight` fields and inflight maps every
 * nexus used to carry.
 */
export interface LoadGate {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  isRunning(key: string): boolean;
  /** Forget in-flight loads (session teardown). Their promises still settle. */
  clear(): void;
}

export function createLoadGate(): LoadGate {
  const inflight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;

      const promise: Promise<T> = (async () => task())().finally(() => {
        // After a clear(), a newer load may own this key. Only remove our own.
        if (inflight.get(key) === promise) inflight.delete(key);
      });
      inflight.set(key, promise);
      return promise;
    },

    isRunning(key: string): boolean {
      return inflight.has(key);
    },

    clear(): void {
      inflight.clear();
    },
  };
}

/** True when a load finished inside the freshness window. A zero timestamp is never fresh. */
export function isFresh(
  lastLoadedAt: number,
  freshnessMs: number,
  now: number = Date.now(),
): boolean {
  return lastLoadedAt > 0 && now - lastLoadedAt < freshnessMs;
}
