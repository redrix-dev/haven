import { Uniwind } from 'uniwind';
import { builtinThemes, type BuiltinThemeId } from '@shared/themes';

export { NAV_THEME, THEME } from './reusables-theme.generated';

/* GENERATED:reusables-theme-refs:start */
// background foreground card popover primary secondary muted accent destructive border input ring radius NAV_THEME
/* GENERATED:reusables-theme-refs:end */

export function normalizeMobileThemeId(themeId: string): BuiltinThemeId {
  return themeId in builtinThemes ? (themeId as BuiltinThemeId) : 'default';
}

export function applyMobileTheme(themeId: string): BuiltinThemeId {
  const normalizedThemeId = normalizeMobileThemeId(themeId);
  Uniwind.setTheme(normalizedThemeId);
  return normalizedThemeId;
}