import { vars } from 'nativewind';
import type { HavenThemeTokens } from '@shared/themes/types';

export function buildNativeThemeVars(tokens: HavenThemeTokens) {
  const entries = Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [`--${key}`, value])
  );
  return vars(entries);
}