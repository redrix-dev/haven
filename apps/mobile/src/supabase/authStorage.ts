import AsyncStorage from "@react-native-async-storage/async-storage";

export type SupabaseAuthStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let customAuthStorageAdapter: SupabaseAuthStorageAdapter | null = null;

export const setMobileAuthStorageAdapter = (
  adapter: SupabaseAuthStorageAdapter,
): void => {
  customAuthStorageAdapter = adapter;
};

const asyncStorageAdapter: SupabaseAuthStorageAdapter = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/**
 * Baseline storage is AsyncStorage.
 * Optional secure adapters can be registered at app bootstrap by calling `setMobileAuthStorageAdapter`.
 */
export const getMobileAuthStorageAdapter = (): SupabaseAuthStorageAdapter => {
  return customAuthStorageAdapter ?? asyncStorageAdapter;
};
