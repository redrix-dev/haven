import fs from 'node:fs';
import path from 'node:path';
import {
  builtinThemes,
  createThemeProxy,
  defaultTokens,
  resolveSemanticEntries,
  semanticToPrimitive,
  type BuiltinThemeId,
} from '../../packages/shared/src/themes';

const rootDir = path.resolve(__dirname, '../..');
const globalsPath = path.join(rootDir, 'packages/shared/src/styles/globals.css');
const mobileGlobalsPath = path.join(rootDir, 'apps/mobile/global.css');
const mobileThemesPath = path.join(rootDir, 'apps/mobile/uniwind-themes.generated.cjs');
const mobileUniwindTypesPath = path.join(rootDir, 'apps/mobile/uniwind-types.d.ts');
const mobileReusablesThemePath = path.join(
  rootDir,
  'apps/mobile/src/lib/reusables-theme.generated.ts'
);
const mobileThemeTsPath = path.join(rootDir, 'apps/mobile/src/lib/theme.ts');
const REUSABLES_REFS_START = '/* GENERATED:reusables-theme-refs:start */';
const REUSABLES_REFS_END = '/* GENERATED:reusables-theme-refs:end */';

/** Reusables / shadcn doctor + React Navigation compat (camelCase keys). */
const REUSABLES_THEME_KEYS = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'border',
  'input',
  'ring',
  'radius',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
] as const;

const REUSABLES_CSS_VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'radius',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
] as const;

const START_MARKER = '/* GENERATED:theme-bridge:start */';
const END_MARKER = '/* GENERATED:theme-bridge:end */';
const MOBILE_START_MARKER = '/* GENERATED:mobile-theme-bridge:start */';
const MOBILE_END_MARKER = '/* GENERATED:mobile-theme-bridge:end */';

function replaceBetweenMarkers(
  source: string,
  replacement: string,
  startMarker = START_MARKER,
  endMarker = END_MARKER
): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Theme bridge markers were not found or are misordered.');
  }
  const before = source.slice(0, start);
  const after = source.slice(end + endMarker.length);
  return `${before}${replacement}${after}`;
}

function generateCssBridgeBlock(): string {
  const lines = Object.entries(semanticToPrimitive).map(
    ([semantic, primitive]) => `  --color-${semantic}: var(--${primitive});`
  );
  return [START_MARKER, '@theme inline {', ...lines, '}', END_MARKER].join('\n');
}

function getMobileThemeVariableNames(): string[] {
  const seen = new Set<string>();
  const variables: string[] = [];
  for (const token of Object.keys(defaultTokens)) {
    if (!seen.has(token)) {
      seen.add(token);
      variables.push(token);
    }
  }
  for (const semantic of Object.keys(semanticToPrimitive)) {
    if (!seen.has(semantic)) {
      seen.add(semantic);
      variables.push(semantic);
    }
  }
  return variables;
}

function resolveThemeVariables(themeId: BuiltinThemeId): Record<string, string> {
  const theme = builtinThemes[themeId];
  if (!theme) {
    throw new Error(`Theme "${themeId}" was not found.`);
  }
  const proxy = createThemeProxy(theme.tokens);
  return {
    ...theme.tokens,
    ...resolveSemanticEntries(proxy),
  };
}

function generateMobileCssBridgeBlock(): string {
  const variableNames = getMobileThemeVariableNames();
  const themeIds = Object.keys(builtinThemes);
  const lines: string[] = [
    MOBILE_START_MARKER,
    '@layer theme {',
    '  :root {',
  ];
  const defaultVariables = resolveThemeVariables('default');
  for (const variableName of variableNames) {
    const value = defaultVariables[variableName];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Theme "default" is missing "${variableName}".`);
    }
    lines.push(`    --${variableName}: ${value};`);
  }
  lines.push('');

  for (const builtinThemeId of ['light', 'dark']) {
    lines.push(`    @variant ${builtinThemeId} {`);
    for (const variableName of variableNames) {
      const value = defaultVariables[variableName];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Theme "${builtinThemeId}" is missing "${variableName}".`);
      }
      lines.push(`      --${variableName}: ${value};`);
    }
    lines.push('    }');
  }

  for (const themeId of themeIds as BuiltinThemeId[]) {
    const variables = resolveThemeVariables(themeId);
    lines.push(`    @variant ${themeId} {`);
    for (const variableName of variableNames) {
      const value = variables[variableName];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Theme "${themeId}" is missing "${variableName}".`);
      }
      lines.push(`      --${variableName}: ${value};`);
    }
    lines.push('    }');
  }

  lines.push('  }', '}', '', '@theme inline {');
  for (const variableName of variableNames) {
    lines.push(`  --color-${variableName}: var(--${variableName});`);
  }
  lines.push('}', MOBILE_END_MARKER);
  return lines.join('\n');
}

function generateMobileThemesConfig(): string {
  const themeIds = Object.keys(builtinThemes);
  return [
    '// Generated by tooling/scripts/generate-theme-bridge.ts.',
    '// Do not edit by hand.',
    '',
    'module.exports = {',
    `  extraThemes: ${JSON.stringify(themeIds)},`,
    '};',
    '',
  ].join('\n');
}

function resolveReusablesCssVariables(themeId: BuiltinThemeId): Record<string, string> {
  const variables = resolveThemeVariables(themeId);
  const resolved: Record<string, string> = {};
  for (const name of REUSABLES_CSS_VARIABLES) {
    const value = variables[name];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Theme "${themeId}" is missing reusables variable "${name}".`);
    }
    resolved[name] = value;
  }
  return resolved;
}

function buildReusablesThemePalette(
  variables: Record<string, string>
): Record<(typeof REUSABLES_THEME_KEYS)[number], string> {
  const pick = (semantic: string, cssName?: string) => {
    const value = variables[semantic] ?? (cssName ? variables[cssName] : undefined);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing reusables theme value for "${semantic}".`);
    }
    return value;
  };

  return {
    background: pick('background'),
    foreground: pick('foreground'),
    card: pick('card'),
    cardForeground: pick('card-foreground'),
    popover: pick('popover'),
    popoverForeground: pick('popover-foreground'),
    primary: pick('primary'),
    primaryForeground: pick('primary-foreground'),
    secondary: pick('secondary'),
    secondaryForeground: pick('secondary-foreground'),
    muted: pick('muted'),
    mutedForeground: pick('muted-foreground'),
    accent: pick('accent'),
    accentForeground: pick('accent-foreground'),
    destructive: pick('destructive'),
    border: pick('border'),
    input: pick('input'),
    ring: pick('ring'),
    radius: pick('radius'),
    chart1: pick('chart-1'),
    chart2: pick('chart-2'),
    chart3: pick('chart-3'),
    chart4: pick('chart-4'),
    chart5: pick('chart-5'),
  };
}

function generateReusablesThemeModule(): string {
  const lightPalette = buildReusablesThemePalette(resolveReusablesCssVariables('default'));
  const darkPalette = buildReusablesThemePalette(resolveReusablesCssVariables('default'));

  const formatPalette = (palette: Record<string, string>, indent: string) =>
    Object.entries(palette)
      .map(([key, value]) => `${indent}${key}: ${JSON.stringify(value)},`)
      .join('\n');

  const navColors = (palette: Record<string, string>, indent: string) =>
    [
      `${indent}background: ${JSON.stringify(palette.background)},`,
      `${indent}border: ${JSON.stringify(palette.border)},`,
      `${indent}card: ${JSON.stringify(palette.card)},`,
      `${indent}notification: ${JSON.stringify(palette.destructive)},`,
      `${indent}primary: ${JSON.stringify(palette.primary)},`,
      `${indent}text: ${JSON.stringify(palette.foreground)},`,
    ].join('\n');

  return [
    '// Generated by tooling/scripts/generate-theme-bridge.ts.',
    '// Do not edit by hand.',
    '//',
    '// Reusables / React Navigation compat layer. Runtime theming uses Uniwind + applyMobileTheme().',
    '',
    "import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';",
    '',
    'export const THEME = {',
    '  light: {',
    formatPalette(lightPalette, '    '),
    '  },',
    '  dark: {',
    formatPalette(darkPalette, '    '),
    '  },',
    '} as const;',
    '',
    "export const NAV_THEME: Record<'light' | 'dark', Theme> = {",
    '  light: {',
    '    ...DefaultTheme,',
    '    colors: {',
    navColors(lightPalette, '      '),
    '    },',
    '  },',
    '  dark: {',
    '    ...DarkTheme,',
    '    colors: {',
    navColors(darkPalette, '      '),
    '    },',
    '  },',
    '};',
    '',
  ].join('\n');
}

function generateMobileUniwindTypes(): string {
  // Byte-identical to what uniwind itself writes on every Metro run — both
  // writers must agree or the file flip-flops between formats and
  // check-theme-bridge reports it stale after every bundle.
  const themeIds = ['light', 'dark', ...Object.keys(builtinThemes)];
  const themeList = themeIds.map((id) => `'${id}'`).join(', ');
  return [
    '// NOTE: This file is generated by uniwind and it should not be edited manually.',
    '/// <reference types="uniwind/types" />',
    '',
    "declare module 'uniwind' {",
    '    export interface UniwindConfig {',
    `        themes: readonly [${themeList}]`,
    '    }',
    '}',
    '',
    'export {}',
    '',
  ].join('\n');
}

function updateThemeTsReusablesRefs(): void {
  const doctorTokens = [
    'background',
    'foreground',
    'card',
    'popover',
    'primary',
    'secondary',
    'muted',
    'accent',
    'destructive',
    'border',
    'input',
    'ring',
    'radius',
    'NAV_THEME',
  ];
  const replacement = [
    REUSABLES_REFS_START,
    `// ${doctorTokens.join(' ')}`,
    REUSABLES_REFS_END,
  ].join('\n');
  const source = fs.readFileSync(mobileThemeTsPath, 'utf8');
  const next = replaceBetweenMarkers(source, replacement, REUSABLES_REFS_START, REUSABLES_REFS_END);
  writeIfChanged(mobileThemeTsPath, next);
}

function writeIfChanged(filePath: string, nextContents: string): void {
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (previous !== nextContents) {
    fs.writeFileSync(filePath, nextContents, 'utf8');
  }
}

function main(): void {
  const globalsSource = fs.readFileSync(globalsPath, 'utf8');
  const nextGlobals = replaceBetweenMarkers(globalsSource, generateCssBridgeBlock());
  writeIfChanged(globalsPath, nextGlobals);

  const mobileSource = fs.readFileSync(mobileGlobalsPath, 'utf8');
  const nextMobile = replaceBetweenMarkers(
    mobileSource,
    generateMobileCssBridgeBlock(),
    MOBILE_START_MARKER,
    MOBILE_END_MARKER
  );
  writeIfChanged(mobileGlobalsPath, nextMobile);

  writeIfChanged(mobileThemesPath, generateMobileThemesConfig());
  writeIfChanged(mobileUniwindTypesPath, generateMobileUniwindTypes());
  writeIfChanged(mobileReusablesThemePath, generateReusablesThemeModule());
  updateThemeTsReusablesRefs();

  process.stdout.write('Theme bridge generation complete.\n');
}

main();
