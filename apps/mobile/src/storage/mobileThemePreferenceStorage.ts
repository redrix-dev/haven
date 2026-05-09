import AsyncStorage from "@react-native-async-storage/async-storage";

const THEME_ID_KEY = "haven.mobile.themePreference.v1";

/** Raw theme id string persisted between launches (validated when applied via `getTheme`). */
export async function loadPersistedThemeId(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(THEME_ID_KEY);
    if (!raw || raw.trim().length === 0) return null;
    return raw.trim();
  } catch {
    return null;
  }
}

export async function persistThemeId(themeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_ID_KEY, themeId);
  } catch {
    // Non-fatal: UI theme still updates in memory.
  }
}

export async function clearPersistedThemeId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(THEME_ID_KEY);
  } catch {
    // Non-fatal.
  }
}
