import { execSync } from 'node:child_process';
import fs from 'node:fs';

function run(command) {
  return execSync(command, { stdio: 'pipe', encoding: 'utf8' }).trim();
}

try {
  const globalsPath = 'packages/shared/src/styles/globals.css';
  const mobileGlobalsPath = 'apps/mobile/global.css';
  const mobileThemesPath = 'apps/mobile/uniwind-themes.generated.cjs';
  const mobileUniwindTypesPath = 'apps/mobile/uniwind-types.d.ts';
  const beforeGlobals = fs.readFileSync(globalsPath, 'utf8');
  const beforeMobile = fs.readFileSync(mobileGlobalsPath, 'utf8');
  const beforeMobileThemes = fs.readFileSync(mobileThemesPath, 'utf8');
  const beforeMobileUniwindTypes = fs.readFileSync(mobileUniwindTypesPath, 'utf8');

  run('npx tsx tooling/scripts/generate-theme-bridge.ts');
  const afterGlobals = fs.readFileSync(globalsPath, 'utf8');
  const afterMobile = fs.readFileSync(mobileGlobalsPath, 'utf8');
  const afterMobileThemes = fs.readFileSync(mobileThemesPath, 'utf8');
  const afterMobileUniwindTypes = fs.readFileSync(mobileUniwindTypesPath, 'utf8');
  if (
    beforeGlobals !== afterGlobals ||
    beforeMobile !== afterMobile ||
    beforeMobileThemes !== afterMobileThemes ||
    beforeMobileUniwindTypes !== afterMobileUniwindTypes
  ) {
    process.stderr.write(
      'Theme bridge outputs are stale. Run `npx tsx tooling/scripts/generate-theme-bridge.ts` and commit the changes.\n'
    );
    process.exit(1);
  }
  process.stdout.write('Theme bridge outputs are up to date.\n');
} catch (error) {
  process.stderr.write(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
