import type { DevicePersistence } from "./DevicePersistence";

const STORAGE_PREFIX = "haven:";

/**
 * Browser localStorage adapter for DevicePersistence.
 * Used by Tauri (webview) and web builds. Keys are prefixed to avoid collisions.
 */
export function createLocalStoragePersistence(): DevicePersistence {
  const storage =
    typeof globalThis !== "undefined" &&
    "localStorage" in globalThis &&
    globalThis.localStorage
      ? globalThis.localStorage
      : null;

  const prefixed = (key: string) =>
    key.startsWith(STORAGE_PREFIX) ? key : `${STORAGE_PREFIX}${key}`;

  return {
    getString(key) {
      if (!storage) return null;
      try {
        return storage.getItem(prefixed(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!storage) return;
      try {
        storage.setItem(prefixed(key), value);
      } catch (error) {
        console.warn("[DevicePersistence] localStorage set failed", error);
      }
    },
    remove(key) {
      if (!storage) return;
      try {
        storage.removeItem(prefixed(key));
      } catch (error) {
        console.warn("[DevicePersistence] localStorage remove failed", error);
      }
    },
  };
}
