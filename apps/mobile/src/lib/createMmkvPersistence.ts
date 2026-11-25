import { createMMKV, type MMKV } from "react-native-mmkv";
import type { DevicePersistence } from "@shared/core/persistence/DevicePersistence";
import { tracePersistence } from "@shared/debug/tracePersist";

const DEFAULT_STORAGE_ID = "haven-device-storage";

/**
 * MMKV-backed DevicePersistence for the mobile app.
 */
export function createMmkvPersistence(
  id: string = DEFAULT_STORAGE_ID,
): DevicePersistence {
  let mmkv: MMKV | null = null;

  const getStorage = (): MMKV => {
    if (!mmkv) {
      mmkv = createMMKV({ id });
    }
    return mmkv;
  };

  return tracePersistence({
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
  });
}
