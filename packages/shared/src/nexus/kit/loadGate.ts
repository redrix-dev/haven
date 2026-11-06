import { perfTrace } from "@shared/debug/perfTrace";

/**
 * One load per key at a time. A second `run` for a key that is already in
 * flight gets the same promise instead of firing a second request, so rapid
 * navigation or overlapping triggers cost one round trip and one state write.
 *
 * This replaces the hand-written `loadInflight` fields and inflight maps every
 * nexus used to carry.
 *
 * When perf tracing is on, a new load is one `loadgate` span (`inflight=new`,
 * `stale=0|1`) and a joined caller is one `loadgate.join` mark. Tracing does
 * not change which promise callers share.
 */
export interface LoadGate {
  /**
   * Run `task`, or join the load for `key` already in flight. The task gets
   * `stale()`, which turns true once its load is forgotten — by clear() or by
   * forget(key) — after it started: a task checks it after each `await` and
   * skips its writes when stale, so a load that finishes after sign-out, or
   * after its community was lost, can't put the old data back.
   */
  run<T>(key: string, task: (stale: () => boolean) => Promise<T>): Promise<T>;
  isRunning(key: string): boolean;
  /**
   * Mark the load for one key stale and stop deduping on it; the next run for
   * the key starts a fresh request. Its promise still settles.
   */
  forget(key: string): void;
  /**
   * Session teardown: forget every in-flight load. Their promises still
   * settle; a well-behaved task just stops writing.
   */
  clear(): void;
}

export function createLoadGate(): LoadGate {
  type Load = { promise: Promise<unknown>; forgotten: boolean };
  const inflight = new Map<string, Load>();

  const forget = (key: string) => {
    const load = inflight.get(key);
    if (!load) return;
    load.forgotten = true;
    inflight.delete(key);
  };

  return {
    run<T>(
      key: string,
      task: (stale: () => boolean) => Promise<T>,
    ): Promise<T> {
      const existing = inflight.get(key);
      if (existing) {
        perfTrace.mark("loadgate.join", { key, inflight: "joined" });
        return existing.promise as Promise<T>;
      }

      const load: Load = { promise: Promise.resolve(), forgotten: false };
      const span = perfTrace.begin("loadgate", { key, inflight: "new" });
      let sawStale = false;
      const promise = (async () =>
        task(() => {
          if (load.forgotten) sawStale = true;
          return load.forgotten;
        }))().finally(() => {
        span.end({ stale: sawStale ? 1 : 0 });
        // Once forgotten, a newer load may own this key. Only remove our own.
        if (inflight.get(key) === load) inflight.delete(key);
      });
      load.promise = promise;
      inflight.set(key, load);
      return promise;
    },

    isRunning(key: string): boolean {
      return inflight.has(key);
    },

    forget,

    clear(): void {
      for (const key of [...inflight.keys()]) forget(key);
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
