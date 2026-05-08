import type { HavenTheme } from './types';
import { defaultTokens } from './tokens';

export const themes: Record<string, HavenTheme> = {
  default: {
    id: 'default',
    name: 'Haven',
    tokens: defaultTokens,
  },
  halloween: {
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
      'primary': '#e06c00',
      'primary-hover': '#c45e00',
    },
  },
};

export const getTheme = (id: string): HavenTheme =>
  themes[id] ?? themes.default;