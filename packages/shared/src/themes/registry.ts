import type { HavenTheme, HavenThemeInput, HavenThemeRegistry, HavenThemeTokens, ResolveThemeOptions } from './types';
import { defaultTokens } from './tokens';

function createTheme(input: HavenThemeInput): HavenTheme {
  return {
    version: 1,
    source: 'builtin',
    entitlementKey: null,
    status: 'active',
    ...input,
  };
}

export const builtinThemes: HavenThemeRegistry = {
  default: createTheme({
      id: 'default',
      name: 'Haven',
      tokens: defaultTokens,
  }),
  halloween: createTheme({
      id: 'halloween',
      name: 'Halloween',
      tokens: {
        ...defaultTokens,
        'surface-0': '#110800',
        'surface-1': '#1a0e00',
        'surface-2': '#221200',
        'surface-3': '#2a1800',
        'surface-3b': '#321d00',
        'surface-4': '#3d2500',
        'surface-5': '#4a2e00',
        'border-subtle': '#5c3a00',
        'border-default': '#6b4400',
        primary: '#e06c00',
        'primary-hover': '#c45e00',
      },
      status: 'preview',
  }),
  winter: createTheme({
    id: 'winter',
    name: 'Winter',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0a0f18',
      'surface-1': '#0f1620',
      'surface-2': '#141e2d',
      'surface-3': '#1a2535',
      'surface-3b': '#1f2d3f',
      'surface-4': '#253548',
      'surface-5': '#2c3f55',
      'border-subtle': '#2a4060',
      'border-default': '#3a5275',
      'primary': '#7eb8d4',
      'primary-hover': '#6aa8c4',
    },
  }),
};

export const themes = builtinThemes;

function sanitizeTokens(tokens: unknown): HavenThemeTokens | null {
  if (!tokens || typeof tokens !== 'object') {
    return null;
  }
  const next: HavenThemeTokens = {};
  for (const [key, value] of Object.entries(tokens as Record<string, unknown>)) {
    if (typeof key === 'string' && typeof value === 'string' && value.trim().length > 0) {
      next[key] = value.trim();
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

function validateAndSanitizeTheme(theme: unknown): HavenTheme | null {
  if (!theme || typeof theme !== 'object') {
    return null;
  }
  const candidate = theme as Partial<HavenTheme>;
  if (!candidate.id || !candidate.name) {
    return null;
  }
  const sanitizedTokens = sanitizeTokens(candidate.tokens);
  if (!sanitizedTokens) {
    return null;
  }
  return createTheme({
    id: candidate.id,
    name: candidate.name,
    tokens: sanitizedTokens,
    version: candidate.version,
    source: candidate.source,
    entitlementKey: candidate.entitlementKey ?? null,
    status: candidate.status,
  });
}

export function validateAndSanitize(otaPayload?: unknown): HavenThemeRegistry {
  if (!otaPayload || typeof otaPayload !== 'object') {
    return {};
  }
  const next: HavenThemeRegistry = {};
  for (const value of Object.values(otaPayload as Record<string, unknown>)) {
    const sanitizedTheme = validateAndSanitizeTheme(value);
    if (sanitizedTheme) {
      next[sanitizedTheme.id] = sanitizedTheme;
    }
  }
  return next;
}

export function resolveThemeRegistry(
  builtins: HavenThemeRegistry = builtinThemes,
  otaPayload?: unknown
): HavenThemeRegistry {
  return {
    ...builtins,
    ...validateAndSanitize(otaPayload),
  };
}

export function resolveTheme(themeRegistry: HavenThemeRegistry, options: ResolveThemeOptions): HavenTheme {
  const allowedEntitlements = new Set(options.allowedEntitlements ?? []);
  const fallbackThemeId = options.fallbackThemeId ?? 'default';
  const requested = options.selectedThemeId ? themeRegistry[options.selectedThemeId] : undefined;

  if (
    requested &&
    requested.status !== 'disabled' &&
    (!requested.entitlementKey || allowedEntitlements.has(requested.entitlementKey))
  ) {
    return requested;
  }

  return themeRegistry[fallbackThemeId] ?? themeRegistry.default;
}

export const getTheme = (id: string): HavenTheme => themes[id] ?? themes.default;