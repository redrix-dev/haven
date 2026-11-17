import { LazyStore } from "@tauri-apps/plugin-store";
import type { DevicePersistence } from "@shared/core/persistence/DevicePersistence";

/** Matches mobile's MMKV id: one store file for every key. */
const STORE_FILE = "haven-device-storage.json";

/**
 * Durable desktop persistence via tauri-plugin-store.
 * Device storage is read synchronously, so this keeps an in-memory copy and writes through
 * to the plugin store asynchronously (autoSave debounced on the plugin side).
 */
export async function createTauriPluginStorePersistence(): Promise<DevicePersistence> {
  const store = new LazyStore(STORE_FILE, {
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
