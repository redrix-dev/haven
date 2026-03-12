import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseCliCommand, resolveSupabaseLocalEnv } from './resolve-supabase-local-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function run(command, args, options = {}) {
  console.log(`[db-suite] ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? false,
  });
}

function ensureSupabaseRunning(cli) {
  try {
    resolveSupabaseLocalEnv();
  } catch {
    run(cli.command, [...cli.baseArgs, 'start'], { shell: cli.shell });
  }
}

function isResetSchemaReady() {
  const env = resolveSupabaseLocalEnv();
  const probe = execFileSync(
    'psql',
    [
      env.POSTGRES_URL,
      '-t',
      '-A',
      '-c',
      "select case when to_regclass('public.communities') is not null and to_regclass('public.notification_dispatch_wakeups') is not null then 1 else 0 end",
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  return probe.trim() === '1';
}

try {
  const cli = getSupabaseCliCommand();
  ensureSupabaseRunning(cli);
  try {
    run(cli.command, [...cli.baseArgs, 'db', 'reset', '--local'], { shell: cli.shell });
  } catch (error) {
    if (isResetSchemaReady()) {
      console.warn(
        '[db-suite] db reset returned non-zero, but required migrated tables exist. Continuing with bootstrap/sql suite.'
      );
    } else {
      throw error;
    }
  }
  run('node', ['tooling/scripts/test/bootstrap-local-auth-users.mjs']);
  run('node', ['tooling/scripts/test/run-supabase-sql-suite.mjs']);
} catch (error) {
  console.error('[db-suite] Failed:', error);
  process.exitCode = 1;
}
