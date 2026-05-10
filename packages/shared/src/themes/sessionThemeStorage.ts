const STORAGE_KEY = "haven_shell_theme_id_v1";

export function readSessionStoredThemeId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeSessionStoredThemeId(themeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // ignore quota / private mode
  }
}
