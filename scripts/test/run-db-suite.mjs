import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseCliCommand } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function run(command, args, options = {}) {
  console.log(`[db-suite] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? false,
  });
}

try {
  const cli = getSupabaseCliCommand();
  run(cli.command, [...cli.baseArgs, 'db', 'reset', '--local'], { shell: cli.shell });
  run('node', ['scripts/test/bootstrap-local-auth-users.mjs']);
  run('node', ['scripts/test/run-supabase-sql-suite.mjs']);
} catch (error) {
  console.error('[db-suite] Failed:', error);
  process.exitCode = 1;
}
