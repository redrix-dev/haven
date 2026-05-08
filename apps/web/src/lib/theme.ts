import type { HavenThemeTokens } from '@shared/themes/types';

export function applyThemeWeb(tokens: HavenThemeTokens): void {
  const root = document.documentElement;
  (Object.entries(tokens) as [string, string][]).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

export function removeThemeWeb(): void {
  document.documentElement.removeAttribute('data-theme');
}