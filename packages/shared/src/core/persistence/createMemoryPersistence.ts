import type { DevicePersistence } from "./DevicePersistence";

/**
 * In-memory DevicePersistence for tests and any host without a disk adapter.
 * State is process-local; nothing survives reload.
 */
export function createMemoryPersistence(): DevicePersistence {
  const store = new Map<string, string>();

  return {
    getString(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    set(key, value) {
      store.set(key, value);
    },
    remove(key) {
      store.delete(key);
    },
  };
}
