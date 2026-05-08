import { vars } from 'nativewind';
import { createThemeProxy, resolveSemanticEntries } from '@shared/themes';
import type { HavenThemeTokens } from '@shared/themes/types';

export function buildNativeThemeVars(tokens: HavenThemeTokens) {
  const proxy = createThemeProxy(tokens);
  const entries = {
    ...Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--${key}`, value])),
    ...Object.fromEntries(
      Object.entries(resolveSemanticEntries(proxy)).map(([key, value]) => [`--${key}`, value])
    ),
  };
  return vars(entries);
}