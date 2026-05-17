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

export const builtinThemes = {
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
  // Midnight Purple — deep violet/indigo, feels premium and mysterious
  midnight: createTheme({
  id: 'midnight',
  name: 'Midnight',
  tokens: {
    ...defaultTokens,
    'surface-0': '#0d0a1a',
    'surface-1': '#120f24',
    'surface-2': '#18142f',
    'surface-3': '#1f1a3d',
    'surface-3b': '#261f4a',
    'surface-4': '#2e2558',
    'surface-5': '#382d6a',
    'border-subtle': '#3d3070',
    'border-default': '#4a3a8a',
    primary: '#8b5cf6',
    'primary-hover': '#7c3aed',
  },
  }),

  // Forest — muted greens, earthy and calm, nature-inspired
  forest: createTheme({
  id: 'forest',
  name: 'Forest',
  tokens: {
    ...defaultTokens,
    'surface-0': '#080f0a',
    'surface-1': '#0d1610',
    'surface-2': '#111d14',
    'surface-3': '#162419',
    'surface-3b': '#1c2e20',
    'surface-4': '#223828',
    'surface-5': '#294430',
    'border-subtle': '#2d4d33',
    'border-default': '#3a6040',
    primary: '#4ade80',
    'primary-hover': '#22c55e',
  },
  }),

  // Dracula — recreation of the famous Dracula editor theme
  dracula: createTheme({
  id: 'dracula',
  name: 'Dracula',
  tokens: {
    ...defaultTokens,
    'surface-0': '#191a21',
    'surface-1': '#1e1f29',
    'surface-2': '#21222c',
    'surface-3': '#282a36',
    'surface-3b': '#2d2f3e',
    'surface-4': '#343646',
    'surface-5': '#3c3f52',
    'border-subtle': '#44475a',
    'border-default': '#565b75',
    primary: '#bd93f9',
    'primary-hover': '#a679f5',
  },
  }),

  // Rose — warm pinks and magentas, soft but bold
  rose: createTheme({
  id: 'rose',
  name: 'Rose',
  tokens: {
    ...defaultTokens,
    'surface-0': '#180a0f',
    'surface-1': '#200d14',
    'surface-2': '#2a1019',
    'surface-3': '#33131f',
    'surface-3b': '#3d1726',
    'surface-4': '#4a1c2e',
    'surface-5': '#582237',
    'border-subtle': '#6b2a43',
    'border-default': '#7d3350',
    primary: '#f43f6e',
    'primary-hover': '#e11d48',
  },
  }),

  // Nord — recreation of the popular Nord color scheme, cool arctic blues
  nord: createTheme({
  id: 'nord',
  name: 'Nord',
  tokens: {
    ...defaultTokens,
    'surface-0': '#1a1e27',
    'surface-1': '#1e2430',
    'surface-2': '#232a38',
    'surface-3': '#2e3440',
    'surface-3b': '#353c4a',
    'surface-4': '#3b4252',
    'surface-5': '#434c5e',
    'border-subtle': '#4c566a',
    'border-default': '#5e6a82',
    primary: '#88c0d0',
    'primary-hover': '#81b4c4',
  },
  }),
  // ============================================================
  // CASTLEVANIA
  // ============================================================

  // Blood Moon — deep crimson castle at night
  'blood-moon': createTheme({
    id: 'blood-moon',
    name: 'Blood Moon',
    tokens: {
      ...defaultTokens,
      'surface-0': '#07070b',
      'surface-1': '#0d0d12',
      'surface-2': '#14141b',
      'surface-3': '#1b1b24',
      'surface-3b': '#22222d',
      'surface-4': '#2b2b38',
      'surface-5': '#343444',
      'border-subtle': '#3f3f52',
      'border-default': '#56566e',
      primary: '#d7264d',
      'primary-hover': '#b81f41',
    },
  }),

  // Crypt — ancient stone, cold and dark
  crypt: createTheme({
    id: 'crypt',
    name: 'Crypt',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0a0a0c',
      'surface-1': '#0f0f12',
      'surface-2': '#141418',
      'surface-3': '#1a1a20',
      'surface-3b': '#202028',
      'surface-4': '#28282f',
      'surface-5': '#303038',
      'border-subtle': '#3a3a45',
      'border-default': '#4a4a58',
      primary: '#9b7fd4',
      'primary-hover': '#8a6cc0',
    },
  }),

  // Belmont — dark gold and bone white, heroic gothic
  belmont: createTheme({
    id: 'belmont',
    name: 'Belmont',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0e0b04',
      'surface-1': '#161005',
      'surface-2': '#1d1508',
      'surface-3': '#251b0a',
      'surface-3b': '#2d220d',
      'surface-4': '#382a10',
      'surface-5': '#443214',
      'border-subtle': '#5a4118',
      'border-default': '#6e511f',
      primary: '#c9a84c',
      'primary-hover': '#b8963e',
    },
  }),

  // ============================================================
  // CYBERPUNK
  // ============================================================

  // Neon Noir — classic cyberpunk hot pink and electric blue
  'neon-noir': createTheme({
    id: 'neon-noir',
    name: 'Neon Noir',
    tokens: {
      ...defaultTokens,
      'surface-0': '#05040a',
      'surface-1': '#090814',
      'surface-2': '#0e0c1d',
      'surface-3': '#14112a',
      'surface-3b': '#1a1635',
      'surface-4': '#211d44',
      'surface-5': '#292556',
      'border-subtle': '#1f4d5a',
      'border-default': '#2b6b80',
      primary: '#ff3d81',
      'primary-hover': '#e62e6f',
    },
  }),

  // Chrome — corporate dystopia, cold steel and acid yellow
  chrome: createTheme({
    id: 'chrome',
    name: 'Chrome',
    tokens: {
      ...defaultTokens,
      'surface-0': '#080808',
      'surface-1': '#0f0f0f',
      'surface-2': '#141414',
      'surface-3': '#1a1a1a',
      'surface-3b': '#202020',
      'surface-4': '#282828',
      'surface-5': '#303030',
      'border-subtle': '#3a3a3a',
      'border-default': '#484848',
      primary: '#e8f000',
      'primary-hover': '#ccd600',
    },
  }),

  // Netrunner — deep teal terminal hacker aesthetic
  netrunner: createTheme({
    id: 'netrunner',
    name: 'Netrunner',
    tokens: {
      ...defaultTokens,
      'surface-0': '#020d0d',
      'surface-1': '#041212',
      'surface-2': '#061818',
      'surface-3': '#081f1f',
      'surface-3b': '#0a2626',
      'surface-4': '#0d3030',
      'surface-5': '#103a3a',
      'border-subtle': '#144848',
      'border-default': '#1a5c5c',
      primary: '#00e5cc',
      'primary-hover': '#00c9b2',
    },
  }),

  // ============================================================
  // GALAXY
  // ============================================================

  // Nebula — deep space purples and cosmic pink
  nebula: createTheme({
    id: 'nebula',
    name: 'Nebula',
    tokens: {
      ...defaultTokens,
      'surface-0': '#060410',
      'surface-1': '#0a0618',
      'surface-2': '#0e0820',
      'surface-3': '#130b2a',
      'surface-3b': '#180e34',
      'surface-4': '#1e1240',
      'surface-5': '#25174e',
      'border-subtle': '#2e1c60',
      'border-default': '#3a2278',
      primary: '#c084fc',
      'primary-hover': '#a855f7',
    },
  }),

  // Void — pure deep space, almost black with electric blue stars
  void: createTheme({
    id: 'void',
    name: 'Void',
    tokens: {
      ...defaultTokens,
      'surface-0': '#02020a',
      'surface-1': '#04040f',
      'surface-2': '#060614',
      'surface-3': '#08081a',
      'surface-3b': '#0a0a20',
      'surface-4': '#0d0d28',
      'surface-5': '#101030',
      'border-subtle': '#141440',
      'border-default': '#1a1a52',
      primary: '#4d9fff',
      'primary-hover': '#3d8fe8',
    },
  }),

  // Aurora — northern lights, deep teal shifting to violet
  aurora: createTheme({
    id: 'aurora',
    name: 'Aurora',
    tokens: {
      ...defaultTokens,
      'surface-0': '#030d0f',
      'surface-1': '#051418',
      'surface-2': '#071a20',
      'surface-3': '#0a2028',
      'surface-3b': '#0d2830',
      'surface-4': '#103040',
      'surface-5': '#143a4c',
      'border-subtle': '#184858',
      'border-default': '#1e5a6e',
      primary: '#2dd4bf',
      'primary-hover': '#14b8a6',
    },
  }),

  // ============================================================
  // EMBERSMITH
  // ============================================================

  // Forge — molten iron, deep charcoal and burning orange
  forge: createTheme({
    id: 'forge',
    name: 'Forge',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0c0804',
      'surface-1': '#140c05',
      'surface-2': '#1c1006',
      'surface-3': '#241508',
      'surface-3b': '#2c1a0a',
      'surface-4': '#38200c',
      'surface-5': '#44280f',
      'border-subtle': '#583214',
      'border-default': '#6e3e18',
      primary: '#f97316',
      'primary-hover': '#ea6a0a',
    },
  }),

  // Cinder — cooling embers, ash grey with deep red heat
  cinder: createTheme({
    id: 'cinder',
    name: 'Cinder',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0a0808',
      'surface-1': '#110e0e',
      'surface-2': '#181414',
      'surface-3': '#201a1a',
      'surface-3b': '#282020',
      'surface-4': '#322828',
      'surface-5': '#3c3030',
      'border-subtle': '#4a3838',
      'border-default': '#5c4444',
      primary: '#dc2626',
      'primary-hover': '#c41f1f',
    },
  }),

  // Brassweld — steampunk smithing, deep brown and polished brass
  brassweld: createTheme({
    id: 'brassweld',
    name: 'Brassweld',
    tokens: {
      ...defaultTokens,
      'surface-0': '#0c0a06',
      'surface-1': '#140e08',
      'surface-2': '#1c140a',
      'surface-3': '#241a0c',
      'surface-3b': '#2c200e',
      'surface-4': '#362810',
      'surface-5': '#403014',
      'border-subtle': '#523c18',
      'border-default': '#644a1e',
      primary: '#d4a227',
      'primary-hover': '#c09020',
    },
  }),
} satisfies HavenThemeRegistry;

export type BuiltinThemeId = keyof typeof builtinThemes;

export const themes: HavenThemeRegistry = builtinThemes;

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