import { LazyStore } from "@tauri-apps/plugin-store";
import type { NexusPersistence } from "@shared/core/persistence/NexusPersistence";

/** Matches mobile MMKV id — one store file for all nexus keys. */
const NEXUS_STORE_FILE = "haven-nexus-storage.json";

/**
 * Durable desktop persistence via tauri-plugin-store.
 * Nexus APIs are sync; this adapter keeps an in-memory cache and writes through
 * to the plugin store asynchronously (autoSave debounced on the plugin side).
 */
export async function createTauriPluginStorePersistence(): Promise<NexusPersistence> {
  const store = new LazyStore(NEXUS_STORE_FILE, {
    defaults: {},
    autoSave: 100,
  });
  await store.init();

  const cache = new Map<string, string>();
  for (const [key, value] of await store.entries<string>()) {
    if (typeof value === "string") {
      cache.set(key, value);
    }
  }

  return {
    getString(key) {
      return cache.get(key) ?? null;
    },
    set(key, value) {
      cache.set(key, value);
      void store.set(key, value).catch((error) => {
        console.warn("[TauriPersistence] store set failed", error);
      });
    },
    remove(key) {
      cache.delete(key);
      void store.delete(key).catch((error) => {
        console.warn("[TauriPersistence] store delete failed", error);
      });
    },
  };
}
