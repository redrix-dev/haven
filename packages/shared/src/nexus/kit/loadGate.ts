/**
 * One load per key at a time. A second `run` for a key that is already in
 * flight gets the same promise instead of firing a second request, so rapid
 * navigation or overlapping triggers cost one round trip and one state write.
 *
 * This replaces the hand-written `loadInflight` fields and inflight maps every
 * nexus used to carry.
 */
export interface LoadGate {
  /**
   * Run `task`, or join the load for `key` already in flight. The task gets
   * `stale()`, which turns true once clear() has run since it started: a task
   * checks it after each `await` and skips its writes when stale, so a load
   * that finishes after sign-out can't put the old session's data into the
   * freshly cleared state.
   */
  run<T>(key: string, task: (stale: () => boolean) => Promise<T>): Promise<T>;
  isRunning(key: string): boolean;
  /**
   * Session teardown: forget in-flight loads and mark them stale. Their
   * promises still settle; a well-behaved task just stops writing.
   */
  clear(): void;
}

export function createLoadGate(): LoadGate {
  const inflight = new Map<string, Promise<unknown>>();
  let generation = 0;

  return {
    run<T>(
      key: string,
      task: (stale: () => boolean) => Promise<T>,
    ): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;

      const startedIn = generation;
      const stale = () => generation !== startedIn;
      const promise: Promise<T> = (async () => task(stale))().finally(() => {
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
      generation += 1;
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
