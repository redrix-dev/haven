import { Uniwind } from 'uniwind';
import { builtinThemes, type BuiltinThemeId } from '@shared/themes';

export function normalizeMobileThemeId(themeId: string): BuiltinThemeId {
  return themeId in builtinThemes ? (themeId as BuiltinThemeId) : 'default';
}

export function applyMobileTheme(themeId: string): BuiltinThemeId {
  const normalizedThemeId = normalizeMobileThemeId(themeId);
  Uniwind.setTheme(normalizedThemeId);
  return normalizedThemeId;
}