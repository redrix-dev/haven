import type { HavenThemeTokens } from "@shared/themes/types";

let applyTokens: ((tokens: HavenThemeTokens) => void) | null = null;

/** Called once from each web/electron entry after importing `applyThemeWeb`. */
export function setShellThemeApplier(fn: (tokens: HavenThemeTokens) => void): void {
  applyTokens = fn;
}

export function applyShellThemeTokens(tokens: HavenThemeTokens): void {
  applyTokens?.(tokens);
}
