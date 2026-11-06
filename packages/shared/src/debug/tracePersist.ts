import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";
import { perfTrace } from "./perfTrace";

/**
 * JSON.stringify + set, timed when perf tracing is on.
 * Disabled tracing takes the same stringify-then-set path with no clock reads.
 * Reads and the storage write itself are timed by `tracePersistence`.
 */
export function tracePersist(
  persistence: NexusPersistence,
  key: string,
  value: unknown,
): void {
  if (!perfTrace.isEnabled()) {
    persistence.set(key, JSON.stringify(value));
    return;
  }
  const started = perfTrace.now();
  const json = JSON.stringify(value);
  const ended = perfTrace.now();
  perfTrace.noteStringify(key, json.length, ended - started, ended);
  persistence.set(key, json);
}

/**
 * Times get/set on the storage port. Fast operations stay in the summary
 * counters. A call of 8ms or more is also its own span.
 */
export function tracePersistence(inner: NexusPersistence): NexusPersistence {
  return {
    getString(key) {
      if (!perfTrace.isEnabled()) return inner.getString(key);
      const started = perfTrace.now();
      const value = inner.getString(key);
      const ended = perfTrace.now();
      perfTrace.noteRead(key, value?.length ?? 0, ended - started, ended);
      return value;
    },
    set(key, value) {
      if (!perfTrace.isEnabled()) {
        inner.set(key, value);
        return;
      }
      const started = perfTrace.now();
      inner.set(key, value);
      const ended = perfTrace.now();
      perfTrace.noteWrite(key, value.length, ended - started, ended);
    },
    remove(key) {
      inner.remove(key);
    },
  };
}
