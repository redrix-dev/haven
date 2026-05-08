import { describe, expect, it } from 'vitest';
import {
  builtinThemes,
  resolveTheme,
  resolveThemeRegistry,
  validateAndSanitize,
} from '@shared/themes/registry';
import { createThemeProxy, resolveSemanticEntries, semanticToPrimitive } from '@shared/themes/semantics';

describe('theme semantics proxy', () => {
  it('resolves semantic keys through the canonical map', () => {
    const tokens = builtinThemes.default.tokens;
    const proxy = createThemeProxy(tokens);
    for (const [semantic, primitive] of Object.entries(semanticToPrimitive)) {
      if (!(semantic in tokens) && tokens[primitive]) {
        expect(proxy[semantic]).toBe(tokens[primitive]);
      }
    }
  });

  it('creates semantic entries that match resolved proxy values', () => {
    const tokens = builtinThemes.default.tokens;
    const proxy = createThemeProxy(tokens);
    const semanticEntries = resolveSemanticEntries(tokens);
    for (const [semantic, value] of Object.entries(semanticEntries)) {
      expect(value).toBe(proxy[semantic]);
    }
  });
});

describe('theme registry resolution', () => {
  it('keeps builtins and merges valid ota themes', () => {
    const merged = resolveThemeRegistry(builtinThemes, {
      ocean: {
        id: 'ocean',
        name: 'Ocean',
        source: 'catalog',
        entitlementKey: 'theme:ocean',
        status: 'active',
        tokens: {
          ...builtinThemes.default.tokens,
          primary: '#1c8fc5',
        },
      },
    });

    expect(merged.default).toBeDefined();
    expect(merged.ocean).toBeDefined();
    expect(merged.ocean.tokens.primary).toBe('#1c8fc5');
  });

  it('drops malformed ota themes during sanitize', () => {
    const ota = validateAndSanitize({
      badTheme: {
        id: 'badTheme',
        name: 'Bad Theme',
        tokens: {},
      },
      goodTheme: {
        id: 'goodTheme',
        name: 'Good Theme',
        tokens: {
          primary: '#123456',
        },
      },
    });

    expect(ota.badTheme).toBeUndefined();
    expect(ota.goodTheme).toBeDefined();
  });

  it('falls back when entitlement is missing', () => {
    const registry = resolveThemeRegistry(builtinThemes, {
      premium: {
        id: 'premium',
        name: 'Premium',
        source: 'catalog',
        entitlementKey: 'theme:premium',
        status: 'active',
        tokens: {
          ...builtinThemes.default.tokens,
          primary: '#8b5cf6',
        },
      },
    });

    const denied = resolveTheme(registry, {
      selectedThemeId: 'premium',
      allowedEntitlements: [],
      fallbackThemeId: 'default',
    });
    expect(denied.id).toBe('default');

    const granted = resolveTheme(registry, {
      selectedThemeId: 'premium',
      allowedEntitlements: ['theme:premium'],
      fallbackThemeId: 'default',
    });
    expect(granted.id).toBe('premium');
  });
});
