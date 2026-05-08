import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const supabaseWorkdir = path.join(repoRoot, 'services');
const outPath = path.join(repoRoot, 'packages/shared/src/types/database.ts');

function getSupabaseCliInvocation() {
  try {
    execFileSync('supabase', ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      cwd: repoRoot,
    });
    return {
      command: 'supabase',
      baseArgs: ['--workdir', supabaseWorkdir],
      shell: false,
    };
  } catch {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      baseArgs: ['supabase', '--workdir', supabaseWorkdir],
      shell: process.platform === 'win32',
    };
  }
}

const cli = getSupabaseCliInvocation();
const output = execFileSync(
  cli.command,
  [
    ...cli.baseArgs,
    'gen',
    'types',
    'typescript',
    '--local',
    '--schema',
    'public',
    '--schema',
    'graphql_public',
  ],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: cli.shell ?? false,
    cwd: repoRoot,
  }
);

fs.writeFileSync(outPath, output, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
