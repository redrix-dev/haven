import fs from 'node:fs';
import path from 'node:path';
import { defaultTokens, semanticToPrimitive } from '../../packages/shared/src/themes';

const rootDir = path.resolve(__dirname, '../..');
const globalsPath = path.join(rootDir, 'packages/shared/src/styles/globals.css');
const mobileTailwindPath = path.join(rootDir, 'apps/mobile/tailwind.config.js');

const START_MARKER = '/* GENERATED:theme-bridge:start */';
const END_MARKER = '/* GENERATED:theme-bridge:end */';

function replaceBetweenMarkers(source: string, replacement: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Theme bridge markers were not found or are misordered.');
  }
  const before = source.slice(0, start);
  const after = source.slice(end + END_MARKER.length);
  return `${before}${replacement}${after}`;
}

function generateCssBridgeBlock(): string {
  const lines = Object.entries(semanticToPrimitive).map(
    ([semantic, primitive]) => `  --color-${semantic}: var(--${primitive});`
  );
  return [START_MARKER, '@theme inline {', ...lines, '}', END_MARKER].join('\n');
}

function generateMobileBridgeBlock(): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const token of Object.keys(defaultTokens)) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    lines.push(`        "${token}": "var(--${token})",`);
  }
  for (const semantic of Object.keys(semanticToPrimitive)) {
    if (seen.has(semantic)) {
      continue;
    }
    seen.add(semantic);
    lines.push(`        "${semantic}": "var(--${semantic})",`);
  }
  return [
    START_MARKER,
    ...lines,
    END_MARKER,
  ].join('\n');
}

function writeIfChanged(filePath: string, nextContents: string): void {
  const previous = fs.readFileSync(filePath, 'utf8');
  if (previous !== nextContents) {
    fs.writeFileSync(filePath, nextContents, 'utf8');
  }
}

function main(): void {
  const globalsSource = fs.readFileSync(globalsPath, 'utf8');
  const nextGlobals = replaceBetweenMarkers(globalsSource, generateCssBridgeBlock());
  writeIfChanged(globalsPath, nextGlobals);

  const mobileSource = fs.readFileSync(mobileTailwindPath, 'utf8');
  const nextMobile = replaceBetweenMarkers(mobileSource, generateMobileBridgeBlock());
  writeIfChanged(mobileTailwindPath, nextMobile);

  process.stdout.write('Theme bridge generation complete.\n');
}

main();
