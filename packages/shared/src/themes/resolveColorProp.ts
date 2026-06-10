import { createThemeProxy } from "./semantics";
import type { HavenThemeTokens } from "./types";

/**
 * Use this helper only for native props that require literal color values.
 * Utility classes should remain the default path for styling.
 */
export function resolveColorProp(
  tokens: HavenThemeTokens,
  key: string,
): string | undefined {
  const proxy = createThemeProxy(tokens);
  const value = proxy[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
