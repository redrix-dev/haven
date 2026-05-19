import { createMMKV, type MMKV } from "react-native-mmkv";
import type { NexusPersistence } from "./NexusPersistence";

const DEFAULT_STORAGE_ID = "haven-nexus-storage";

/**
 * MMKV-backed NexusPersistence for React Native hosts.
 * Web/Electron should use createMemoryPersistence or a localStorage adapter.
 */
export function createMmkvPersistence(
  id: string = DEFAULT_STORAGE_ID,
): NexusPersistence {
  let mmkv: MMKV | null = null;

  const getStorage = (): MMKV => {
    if (!mmkv) {
      mmkv = createMMKV({ id });
    }
    return mmkv;
  };

  return {
    getString(key) {
      const value = getStorage().getString(key);
      return value === undefined ? null : value;
    },
    set(key, value) {
      getStorage().set(key, value);
    },
    remove(key) {
      getStorage().remove(key);
    },
  };
}
