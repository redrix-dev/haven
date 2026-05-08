import { execSync } from 'node:child_process';
import fs from 'node:fs';

function run(command) {
  return execSync(command, { stdio: 'pipe', encoding: 'utf8' }).trim();
}

try {
  const globalsPath = 'packages/shared/src/styles/globals.css';
  const mobileTailwindPath = 'apps/mobile/tailwind.config.js';
  const beforeGlobals = fs.readFileSync(globalsPath, 'utf8');
  const beforeMobile = fs.readFileSync(mobileTailwindPath, 'utf8');

  run('npx tsx tooling/scripts/generate-theme-bridge.ts');
  const afterGlobals = fs.readFileSync(globalsPath, 'utf8');
  const afterMobile = fs.readFileSync(mobileTailwindPath, 'utf8');
  if (beforeGlobals !== afterGlobals || beforeMobile !== afterMobile) {
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
